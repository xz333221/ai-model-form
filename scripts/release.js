#!/usr/bin/env node
/**
 * ai-model-form 发包脚本
 *
 * 流程:
 *   1. 环境检查   —— git 可用 / 仓库正常 / 清理锁文件 / 分支 / 工作区 / npm 登录态
 *   2. 版本号 +1  —— 只动 package.json(默认 patch,见 --minor / --major / --version)
 *   3. 构建产物   —— npm run build(vite lib 模式 → dist/)
 *   4. 产物校验   —— dist 三件套齐全 / 内容非空 / 导出正确 / 不比源码旧
 *   5. 打包预检   —— npm pack --dry-run,确认只发该发的文件(7 个)
 *   6. git 提交   —— 白名单只 commit package.json,打 tag,推送
 *   7. npm 发布
 *   8. 发布后校验 —— 轮询 npm view 直到新版本可见
 *
 * 用法:
 *   npm run release                       # 全流程(默认 patch)
 *   npm run release -- --dry-run          # 只打印计划,不改文件 / 不提交 / 不真发
 *   npm run release -- --skip-push        # 只发 npm,不 push git
 *   npm run release -- --skip-build       # 复用现有 dist(不重新构建)
 *   npm run release -- --minor            # 0.3.0 → 0.4.0
 *   npm run release -- --major            # 0.3.0 → 1.0.0
 *   npm run release -- --version=1.0.0    # 精确指定版本号
 *   npm run release -- --yes              # 交互确认一律同意(CI / 无人值守)
 *   npm run release -- --help
 *
 * 与 zen-gitsync 版本的差异(本项目是「库」而不是「CLI」,所以有取舍):
 *   - 零依赖:不用 chalk,内置 ANSI 颜色(发布链路不该为一个脚本多一个依赖)
 *   - 不自动全局安装:ai-model-form 没有 bin,发完没有 `npm install -g` 这一步
 *   - 多了 dist 产物校验 + npm pack 预检:库里最容易出的事故是「发了旧产物 / 发漏文件」
 *   - git 命令一律用 spawnSync + args 数组:Windows cmd 下不会因中文 commit message 乱码
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ============================================================
// 参数
// ============================================================

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const SKIP_PUSH = argv.includes('--skip-push');
const SKIP_BUILD = argv.includes('--skip-build');
const ASSUME_YES = argv.includes('--yes') || argv.includes('-y');
const HELP = argv.includes('--help') || argv.includes('-h');

const versionFlag = argv.find((a) => a.startsWith('--version='))?.slice('--version='.length);
const BUMP = versionFlag ? 'exact' : argv.includes('--minor') ? 'minor' : argv.includes('--major') ? 'major' : 'patch';

const REGISTRY = 'https://registry.npmjs.org/';

// 只提交这些文件。禁止 `git add .`,防止把工作区脏文件带进 release commit。
// 实际入 commit 的只有 package.json(版本号);dist/ 在 .gitignore 里,由 npm 发布时现场构建。
const RELEASE_FILES = ['package.json'];

// 必须进 tarball 的文件(package.json 的 files 字段决定)
const DIST_FILES = ['ai-model-form.mjs', 'ai-model-form.umd.cjs', 'ai-model-form.css'];
const REQUIRED_IN_TARBALL = [
  'package.json',
  'README.md',
  'LICENSE',
  'server/middleware.js',
  ...DIST_FILES.map((f) => `dist/${f}`),
];
// 绝对不能进 tarball 的路径前缀
const FORBIDDEN_IN_TARBALL = ['node_modules/', 'client/', 'demo/', 'lib/', 'docs/', 'scripts/', 'skill/', '.workbuddy/'];

// 参与「dist 是否比源码旧」比较的源(相对 rootDir)
const SOURCE_ENTRIES = ['lib', 'client/src', 'server/middleware.js', 'vite.lib.config.js'];

if (HELP) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, ''));
  process.exit(0);
}

// ============================================================
// 小工具
// ============================================================

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : String(s));
const cyan = paint(36);
const green = paint(32);
const yellow = paint(33);
const red = paint(31);
const gray = paint(90);
const blue = paint(34);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const step = (title) => console.log(cyan(`\n=== ${title} ===`));
const ok = (msg) => console.log(green(msg));
const warn = (msg) => console.log(yellow(msg));
const info = (msg) => console.log(gray(msg));
const fail = (msg) => console.error(red(msg));

function askContinue(message, defaultYes = true) {
  if (ASSUME_YES) {
    warn(`${message} → --yes,自动继续`);
    return Promise.resolve(true);
  }
  if (!process.stdin.isTTY) {
    warn(`${message} → 非交互环境,自动继续(等价 --yes)`);
    return Promise.resolve(true);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return rl
    .question(message)
    .then((answer) => {
      const a = answer.trim().toLowerCase();
      if (a === '') return defaultYes;
      return a === 'y' || a === 'yes';
    })
    .finally(() => rl.close());
}

function die(message, err) {
  fail(`❌ ${message}${err ? ': ' + (err.message || err) : ''}`);
  process.exit(1);
}

/** git 命令统一走 args 数组(不经 shell),Windows 下中文 message 不会乱码 */
function git(args, opts = {}) {
  return spawnSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: opts.stdio ?? 'inherit' });
}
function gitOut(args) {
  const res = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : '';
}
/** npm 命令:Windows 上 npm 是 npm.cmd,必须过 shell */
function npmRun(args, opts = {}) {
  return spawnSync('npm', args, {
    cwd: opts.cwd ?? rootDir,
    shell: process.platform === 'win32',
    stdio: opts.stdio ?? 'inherit',
    encoding: opts.encoding ?? 'utf8',
  });
}

// 记录本脚本派生出的 git 进程 PID,精准 kill,不 `pkill -f git` 殃及用户其他 git 进程
const spawnedGitPids = new Set();
/** 异步 git(用于可能长时间阻塞的 push,可被 terminateSpawnedGitProcesses 精准终止) */
function runGitAsync(args) {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd: rootDir, stdio: 'inherit' });
    spawnedGitPids.add(proc.pid);
    proc.on('exit', (code) => {
      spawnedGitPids.delete(proc.pid);
      resolve(code ?? -1);
    });
    proc.on('error', () => {
      spawnedGitPids.delete(proc.pid);
      resolve(-1);
    });
  });
}
function terminateSpawnedGitProcesses() {
  for (const pid of spawnedGitPids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* 已退出 */
    }
  }
}

// ============================================================
// 1. 环境检查
// ============================================================

async function checkAndCleanGitLocks() {
  const gitDir = path.join(rootDir, '.git');
  // 具体路径,不用通配符,避免误删
  const lockFiles = [
    path.join(gitDir, 'index.lock'),
    path.join(gitDir, 'HEAD.lock'),
    path.join(gitDir, 'config.lock'),
    path.join(gitDir, 'packed-refs.lock'),
  ];
  const lockDirs = [path.join(gitDir, 'refs', 'heads'), path.join(gitDir, 'refs', 'remotes')];

  const busy = [];
  const unlink = (p) => {
    try {
      fs.unlinkSync(p);
      info(`已删除锁文件: ${p}`);
    } catch (err) {
      busy.push({ path: p, err });
    }
  };

  for (const p of lockFiles) if (fs.existsSync(p)) unlink(p);
  for (const dir of lockDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.lock')) unlink(path.join(dir, name));
    }
  }

  if (!busy.length) return;

  warn('锁文件被占用,尝试终止本脚本启动的 git 进程...');
  terminateSpawnedGitProcesses();
  await sleep(2000);
  for (const item of busy) {
    try {
      fs.unlinkSync(item.path);
      info(`重试后已删除: ${item.path}`);
    } catch (err) {
      fail(`重试仍无法删除 ${item.path}: ${err.message}`);
      if (!(await askContinue('是否继续发布(可能失败)? (Y/n): '))) die('用户选择终止发布');
    }
  }
}

async function checkEnvironment() {
  step('1/8 检查发布环境');

  if (!gitOut(['--version'])) die('未找到 git');
  if (gitOut(['rev-parse', '--is-inside-work-tree']) !== 'true') die('当前目录不是 git 仓库');

  await checkAndCleanGitLocks();

  const branch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD']);
  info(`当前分支: ${branch}`);
  if (branch !== 'main' && branch !== 'master') {
    if (!(await askContinue(`当前不在主分支上,是否继续在 ${branch} 分支上发布? (Y/n): `))) {
      die('用户选择取消发布');
    }
  }

  const dirty = gitOut(['status', '--porcelain']);
  if (dirty) {
    warn('工作区有未提交的更改:');
    console.log(dirty.split('\n').map((l) => '  ' + l).join('\n'));
    warn('注意: dist 会包含这些改动,但它们不会进入 release commit(只提交 package.json)');
    if (!(await askContinue('是否继续发布? (Y/n): '))) die('用户选择取消发布');
  } else {
    ok('git 工作区干净');
  }

  // npm 登录态 —— 提前查,别等到构建完、版本号都改了才发现没登录
  const who = spawnSync('npm', ['whoami', `--registry=${REGISTRY}`], {
    cwd: rootDir,
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  if (who.status === 0) {
    ok(`npm 已登录: ${who.stdout.trim()}`);
  } else {
    fail('npm 未登录或 token 失效,请先执行: npm login --registry https://registry.npmjs.org/');
    if (!(await askContinue('仍未登录,是否继续(发布环节会失败)? (y/N): ', false))) {
      die('用户选择取消发布');
    }
  }

  const remotes = gitOut(['remote', '-v']);
  if (!remotes) warn('未配置 git remote,push 环节会跳过失败');

  ok('环境检查通过');
}

// ============================================================
// 2. 版本号
// ============================================================

function bumpVersion() {
  step('2/8 更新版本号');

  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const current = pkg.version;

  let next;
  if (BUMP === 'exact') {
    next = versionFlag;
    if (!/^\d+\.\d+\.\d+/.test(next)) die(`--version 格式不对: ${next}`);
  } else {
    const [major, minor, patch] = current.split('.').map((n) => parseInt(n, 10));
    next = BUMP === 'major' ? `${major + 1}.0.0` : BUMP === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
  }

  if (next === current) die(`新版本号与当前相同: ${current}`);

  // 该版本号是否已存在(npm view 拿不到就跳过这项校验,不阻塞发布)
  const view = spawnSync('npm', ['view', pkg.name, 'versions', '--json', `--registry=${REGISTRY}`], {
    cwd: rootDir,
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  let publishedList = [];
  try {
    const parsed = JSON.parse(view.stdout || '[]');
    publishedList = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    publishedList = [];
  }
  info(`npm 上已发布: ${publishedList.length ? publishedList.join(', ') : '(读取失败,跳过校验)'}`);
  if (publishedList.includes(next)) {
    die(`npm 上已存在 ${pkg.name}@${next},请换一个版本号(--minor / --major / --version=x.y.z)`);
  }

  pkg.version = next;
  if (DRY_RUN) {
    warn(`[dry-run] 跳过写入: ${current} → ${next}`);
  } else {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    ok(`版本号已更新: ${current} → ${next}`);
  }
  return next;
}

// ============================================================
// 3. 构建
// ============================================================

async function buildDist() {
  step('3/8 构建库产物');

  // 先构建再提交:构建失败时还没产生 commit/tag,可以直接中止,不用回滚 git 状态。
  // (npm publish 自身还会跑一次 prepublishOnly → npm run build,留作 tarball 的最后一道保险)
  if (SKIP_BUILD) {
    warn('--skip-build: 复用现有 dist');
    return;
  }
  if (DRY_RUN) warn('[dry-run] 构建仍会真跑(dist 会被覆盖,但 dist 在 .gitignore 里)');

  const res = npmRun(['run', 'build']);
  if (res.status !== 0) {
    fail('构建失败');
    if (!(await askContinue('构建失败,是否继续发布现有 dist? (y/N): ', false))) {
      die('用户选择取消发布');
    }
    return;
  }
  ok('构建完成');
}

// ============================================================
// 4. 产物校验
// ============================================================

function walkNewestMtime(target) {
  const abs = path.join(rootDir, target);
  if (!fs.existsSync(abs)) return 0;
  const stat = fs.statSync(abs);
  if (stat.isFile()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const name of fs.readdirSync(abs)) {
    if (name === 'node_modules') continue;
    newest = Math.max(newest, walkNewestMtime(path.join(target, name)));
  }
  return newest;
}

function verifyDist() {
  step('4/8 校验 dist 产物');

  let bad = false;
  for (const f of DIST_FILES) {
    const abs = path.join(rootDir, 'dist', f);
    if (!fs.existsSync(abs)) {
      fail(`缺少 dist/${f} —— 先跑 npm run build`);
      bad = true;
      continue;
    }
    const size = fs.statSync(abs).size;
    if (size < 500) {
      fail(`dist/${f} 只有 ${size} B,内容可疑`);
      bad = true;
      continue;
    }
    info(`OK dist/${f} (${(size / 1024).toFixed(2)} KB)`);
  }
  if (bad) die('dist 产物不完整');

  // 导出正确性:ESM 产物必须真的导出 AddModelForm
  const mjs = fs.readFileSync(path.join(rootDir, 'dist', 'ai-model-form.mjs'), 'utf8');
  if (!/AddModelForm/.test(mjs)) die('dist/ai-model-form.mjs 里找不到 AddModelForm 导出,构建可能异常');
  ok('ESM 产物含 AddModelForm 导出');

  // dist 不能比源码旧(改完源码忘了重新构建的典型事故)
  const distMtime = fs.statSync(path.join(rootDir, 'dist', 'ai-model-form.mjs')).mtimeMs;
  const newestSource = Math.max(...SOURCE_ENTRIES.map(walkNewestMtime));
  if (distMtime < newestSource) {
    die(
      'dist 比源码旧(改动没进产物)。' +
        (SKIP_BUILD ? ' 去掉 --skip-build 重新构建即可。' : ' 构建未生效,请检查 vite.lib.config.js。')
    );
  }
  ok('dist 比源码新');
}

// ============================================================
// 5. 打包预检
// ============================================================

function preflightPack() {
  step('5/8 打包预检(npm pack --dry-run)');

  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: rootDir,
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    fail(res.stderr || res.stdout);
    die('npm pack --dry-run 失败');
  }

  let manifest;
  try {
    manifest = JSON.parse(res.stdout)[0];
  } catch (err) {
    die('无法解析 npm pack 输出', err);
  }

  const paths = manifest.files.map((f) => f.path);
  const pkgName = manifest.name;
  const pkgVersion = manifest.version;
  info(`将发布 ${pkgName}@${pkgVersion},${paths.length} 个文件,${(manifest.size / 1024).toFixed(2)} KB`);
  for (const p of paths) info(`  ${p}`);

  const missing = REQUIRED_IN_TARBALL.filter((p) => !paths.includes(p));
  if (missing.length) {
    fail('tarball 缺少文件(package.json 的 files 字段配置有问题):');
    missing.forEach((p) => fail(`  - ${p}`));
    die('打包预检未通过');
  }

  const unexpected = paths.filter((p) => FORBIDDEN_IN_TARBALL.some((bad) => p.startsWith(bad)));
  if (unexpected.length) {
    fail('tarball 混入了不该发的路径:');
    unexpected.forEach((p) => fail(`  - ${p}`));
    die('打包预检未通过');
  }

  ok('打包内容符合预期');
}

// ============================================================
// 6. git 提交
// ============================================================

function stageReleaseFiles() {
  info('stage 白名单文件(不用 `git add .`)...');
  for (const f of RELEASE_FILES) {
    if (!fs.existsSync(path.join(rootDir, f))) continue;
    if (DRY_RUN) {
      warn(`[dry-run] git add ${f}`);
      continue;
    }
    git(['add', f]);
  }
  if (DRY_RUN) return;

  const staged = gitOut(['diff', '--cached', '--name-only'])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const unexpected = staged.filter((f) => !RELEASE_FILES.includes(f));
  if (unexpected.length) {
    fail('staged 范围超出白名单,中止提交:');
    unexpected.forEach((f) => fail(`  - ${f}`));
    process.exit(1);
  }
}

async function commitChanges(version) {
  step('6/8 提交并推送');

  await checkAndCleanGitLocks();
  stageReleaseFiles();

  const message = `chore: 发布版本 v${version}`;
  let committed = DRY_RUN;

  for (let attempt = 1; attempt <= 3 && !committed; attempt++) {
    if (attempt > 1) {
      await checkAndCleanGitLocks();
      warn(`重试提交 (${attempt}/3)...`);
      await sleep(2000);
    }
    if (DRY_RUN) continue;
    const res = git(['commit', '--no-verify', '-m', message]);
    if (res.status === 0) committed = true;
    else warn('提交失败,2 秒后重试...');
  }

  if (DRY_RUN) {
    warn(`[dry-run] git commit --no-verify -m "${message}"`);
  } else if (!committed) {
    die('git commit 连续 3 次失败,请手动处理');
  } else {
    ok(`已提交: "${message}"`);
  }

  if (gitOut(['tag', '-l', `v${version}`])) {
    warn(`标签 v${version} 已存在,跳过打 tag`);
  } else if (DRY_RUN) {
    warn(`[dry-run] git tag v${version}`);
  } else if (git(['tag', `v${version}`]).status === 0) {
    ok(`已创建标签: v${version}`);
  } else {
    warn(`打 tag v${version} 失败,继续`);
  }

  if (SKIP_PUSH) {
    warn('--skip-push: 跳过 git push');
    return;
  }

  const branch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (DRY_RUN) {
    warn(`[dry-run] git push origin ${branch}`);
    warn('[dry-run] git push origin --tags');
    return;
  }

  try {
    info(`推送代码到远程(分支 ${branch})...`);
    const pushCode = await runGitAsync(['push', 'origin', branch]);
    if (pushCode !== 0) warn(`git push 返回 ${pushCode}`);
    info('推送标签...');
    const tagCode = await runGitAsync(['push', 'origin', '--tags']);
    if (tagCode !== 0) warn(`git push --tags 返回 ${tagCode}`);
    if (pushCode === 0 && tagCode === 0) ok('代码和标签已推送');
  } catch (err) {
    // 推送失败不阻塞 npm 发布
    warn(`推送到远程失败(不影响 npm 发布): ${err.message}`);
  }
}

// ============================================================
// 7. npm 发布
// ============================================================

function publishToNpm(version) {
  step('7/8 发布到 npm');

  const args = ['publish', `--registry=${REGISTRY}`];
  if (DRY_RUN) {
    warn('[dry-run] npm publish --dry-run(不会真发)');
    args.push('--dry-run');
  }

  // stdio inherit:npm 可能弹 2FA / OTP 提示,需要能输入
  const res = npmRun(args);
  if (res.status !== 0) die('npm publish 失败');
  ok(DRY_RUN ? 'dry-run 通过' : `已发布 ${version} 到 npm`);
}

// ============================================================
// 8. 发布后校验
// ============================================================

async function verifyPublished(version) {
  step('8/8 校验线上版本');

  if (DRY_RUN) {
    warn('[dry-run] 跳过线上校验');
    return;
  }

  const pkgName = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).name;
  for (let i = 1; i <= 8; i++) {
    const res = spawnSync('npm', ['view', pkgName, 'version', `--registry=${REGISTRY}`], {
      cwd: rootDir,
      shell: process.platform === 'win32',
      encoding: 'utf8',
    });
    const live = (res.stdout || '').trim();
    if (live === version) {
      ok(`npm latest = ${live}`);
      return;
    }
    info(`第 ${i}/8 次查询: latest = ${live || '(空)'},5 秒后重试...`);
    await sleep(5000);
  }
  warn(`未在 40 秒内看到 ${version}(registry CDN 可能还在同步),稍后手动确认: npm view ${pkgName} version`);
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log(cyan(`\n🚀 ai-model-form 发布流程${DRY_RUN ? ' (DRY RUN)' : ''}\n`));
  if (DRY_RUN) warn('--dry-run: 不写版本号 / 不提交 / 不真发,只打印计划');
  if (SKIP_PUSH) warn('--skip-push: 不 push git');
  if (SKIP_BUILD) warn('--skip-build: 不重新构建');
  if (ASSUME_YES) warn('--yes: 交互确认一律同意');
  info(`版本策略: ${BUMP}${versionFlag ? ` (${versionFlag})` : ''}`);

  await checkEnvironment();
  const version = bumpVersion();
  await buildDist();
  verifyDist();
  preflightPack();
  await commitChanges(version);
  publishToNpm(version);
  await verifyPublished(version);

  console.log(green(`\n🎉 发布完成! ${DRY_RUN ? '(dry-run,什么都没真发)' : `v${version} 已上线`}\n`));
}

main().catch((err) => {
  console.error(red('\n❌ 未捕获的错误:'), err);
  process.exit(1);
});
