// 视图设置模块测试：默认值、非法值回落、存储往返、ready 时序
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'chrome-menu-optimizer', 'view-settings.js');

function makeSandbox(initialStore) {
  const store = Object.assign({}, initialStore);
  const sandbox = {
    console: { log() {}, warn() {} },
    setTimeout,
    Promise,
    Number,
    Object,
    chrome: {
      storage: {
        local: {
          get: (keys) => Promise.resolve().then(() => {
            const result = {};
            (Array.isArray(keys) ? keys : [keys]).forEach(k => {
              if (store[k] !== undefined) result[k] = JSON.parse(JSON.stringify(store[k]));
            });
            return result;
          }),
          set: (items) => Promise.resolve().then(() => {
            Object.keys(items).forEach(k => { store[k] = JSON.parse(JSON.stringify(items[k])); });
          })
        }
      }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(FILE, 'utf8'), sandbox);
  return { sandbox, store };
}

const results = [];
function check(name, cond, extra) {
  results.push(cond);
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (extra !== undefined ? ` -> ${extra}` : ''));
}

(async () => {
  console.log('[1] 默认值');
  {
    const { sandbox } = makeSandbox();
    const m = sandbox.bookmarkViewSettings;
    check('默认 columns=3 / preview=5', m.get().columns === 3 && m.get().preview === 5);
    check('DEFAULTS 暴露正确', m.DEFAULTS.columns === 3 && m.DEFAULTS.preview === 5);
    await m.ready();
    check('ready 完成后值仍为默认', m.get().columns === 3 && m.get().preview === 5);
  }

  console.log('[2] 非法值回落');
  {
    const { sandbox } = makeSandbox({
      bookmark_view_settings: { columns: 99, preview: 'abc' }
    });
    const m = sandbox.bookmarkViewSettings;
    await m.ready();
    check('columns=99 回落 3', m.get().columns === 3, m.get().columns);
    check('preview="abc" 回落 5', m.get().preview === 5, m.get().preview);
  }
  {
    const { sandbox } = makeSandbox({
      bookmark_view_settings: { columns: 0, preview: -1 }
    });
    const m = sandbox.bookmarkViewSettings;
    await m.ready();
    check('columns=0 越界回落 3', m.get().columns === 3);
    check('preview=-1 越界回落 5', m.get().preview === 5);
  }
  {
    const { sandbox } = makeSandbox({
      bookmark_view_settings: { columns: 4, preview: 0 }
    });
    const m = sandbox.bookmarkViewSettings;
    await m.ready();
    check('合法值原样采用（4/0）', m.get().columns === 4 && m.get().preview === 0);
  }
  {
    const { sandbox } = makeSandbox({
      bookmark_view_settings: { columns: 5, preview: 10 }
    });
    const m = sandbox.bookmarkViewSettings;
    await m.ready();
    check('边界值 5/10 合法', m.get().columns === 5 && m.get().preview === 10);
  }

  console.log('[3] save 与持久化');
  {
    const { sandbox, store } = makeSandbox();
    const m = sandbox.bookmarkViewSettings;
    const changed = await m.save({ columns: 5 });
    check('save 返回有变化', changed === true);
    check('内存值更新', m.get().columns === 5);
    check('preview 保持默认', m.get().preview === 5);
    check('已写入存储', store.bookmark_view_settings.columns === 5);
    const noChange = await m.save({ columns: 5 });
    check('重复保存返回无变化', noChange === false);
    // 重新加载模块（模拟重开 popup）：应从存储恢复
    const reloaded = makeSandbox({ bookmark_view_settings: store.bookmark_view_settings });
    await reloaded.sandbox.bookmarkViewSettings.ready();
    check('重开后从存储恢复 5/5', reloaded.sandbox.bookmarkViewSettings.get().columns === 5 && reloaded.sandbox.bookmarkViewSettings.get().preview === 5);
  }

  console.log('[4] save 的非法输入');
  {
    const { sandbox } = makeSandbox();
    const m = sandbox.bookmarkViewSettings;
    await m.save({ columns: 99, preview: 'x' });
    check('save 非法值回落默认', m.get().columns === 3 && m.get().preview === 5);
  }

  console.log('[5] ready 时序');
  {
    const { sandbox } = makeSandbox({ bookmark_view_settings: { columns: 2, preview: 8 } });
    const m = sandbox.bookmarkViewSettings;
    const p = m.ready();
    check('ready 是 promise', typeof p.then === 'function');
    await p;
    check('await 后拿到存储值 2/8', m.get().columns === 2 && m.get().preview === 8);
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n===== ${results.length - failed}/${results.length} 通过 =====`);
  if (failed) process.exit(1);
})().catch(e => { console.error('测试执行异常:', e); process.exit(1); });
