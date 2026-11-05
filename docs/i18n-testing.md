# i18n testing and agent workflow

- 更新日期：2026-11-05（Asia/Shanghai）。
- 产品需求与目标行为：[i18n implementation spec](i18n-spec.md)。
- 状态：已有字典单测与 x18n 接入；目标 en/zh-Hans UI 切换及以下新增测试尚未实施。
- 本文集中维护 i18n 覆盖、运行方式和工具限制；通用测试环境、隔离机制、E2E 报告与凭据见 [testing.md](testing.md)。

## Current evidence

**Fact — 2026-11-04 本地源码及本会话运行记录；不是目标功能的完成证明：**

| 项目             | 当前证据                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 字典与运行时     | [t.ts](../src/i18n/t.ts) 加载 en/ko/hu，当前没有客户端语言切换                                                                          |
| 原有 i18n unit   | [i18n.test.ts](../tests/unit/i18n.test.ts) 的 8 个用例：3 个字典检查、3 个语言选择、默认值、未知语言回退                                |
| 日期 unit        | [dates.test.ts](../tests/unit/dates.test.ts) 覆盖 UTC 边界和 en-US/en-GB；尚无中文用例                                                  |
| 全部 unit        | 最近本地运行 21/21 通过；其中 i18n 为上述 8 个                                                                                          |
| x18n             | 安装版本 0.1.7；3 份字典、27 个键、38 处引用，各语言 27/27 非空值                                                                       |
| x18n diagnostics | 0 errors、0 warnings、1 条 `identical-to-source` info：hu.blog 与 en.blog 均为 `Blog`                                                   |
| 负向探针         | 隔离副本中，未知 Astro 键产生 `missing-key`；删除韩语翻译产生 `missing-translation`；`--strict` 下均退出 1，正常对照退出 0              |
| 占位符缺口       | 将 `{total}` 改成 `{wrongTotal}`，当前 general preset 未检出；已有 unit 继续承担占位符检查                                              |
| MCP              | 实际 stdio initialize、tools/list、x18n_status 成功，服务版本 0.1.7，状态与 CLI 一致；配置被 `codex mcp get x18n --json` 识别为 enabled |

x18n 的 100% 指键完整率，不代表翻译质量、整站文本覆盖或浏览器行为。未验证的空白值、冗余键和新占位符配置不能写为“已覆盖”。

当前扫描器识别 `src/**/*.astro`、`src/**/*.ts` 中的字面 `t.key`，排除字典和测试。它是文本匹配：注释可能计入引用，别名、解构、动态键需要调整。未来新增引用形式也必须显式接入扫描，不能通过把所有键列为已使用来消除告警。

x18n 默认 warning 不导致失败；项目 `i18n:check` 使用 `--strict`。MCP 诊断工具没有该 CLI 标志，最终门禁仍运行项目脚本。

## Test design

以下为目标测试，不代表现有文件已包含这些用例。每项覆盖 spec 中明确的行为；建议设计改变时同步修改断言，避免测试自行创造产品要求。

### Static checks

继续由 quality CI 运行 `pnpm run i18n:check`，把支持集合改为 en/zh-Hans。保留少量隔离配置探针验证项目集成，而不是重测整个第三方工具。

| ID  | 输入/变更                                | 预期                                                      |
| --- | ---------------------------------------- | --------------------------------------------------------- |
| S1  | 正常双语字典和实际 UI 引用               | 严格检查通过；语言清单只含 en/zh-Hans                     |
| S2  | 不存在的 `t.key` 或新增翻译引用          | 报告准确文件/键，退出非零                                 |
| S3  | 删除中文键；分别改为空串、空格或换行     | 违反非空/完整契约；核实工具诊断，未覆盖的情况由 unit 兜底 |
| S4  | 丢失或拼错占位符                         | 配置后的 `check` 检出；`apply` 拒绝不匹配值并保持文件不变 |
| S5  | 正确占位符、合法重复占位符、正常翻译写入 | 正向对照通过，避免仅证明工具总是拒绝                      |
| S6  | 目标语言多出键、未使用键                 | 明确诊断与退出行为；不假定等价于严格键集合单测            |

探针在临时副本运行，原始字典与页面保持不变。检查命令退出码、diagnostic code 和修改前后内容；不能以进程崩溃当作预期诊断。

### Unit tests

原 8 个用例按两种语言重组，保留契约，不维持旧用例数量。x18n 不执行应用函数，因此不替代语言选择、格式化和回退单测。

| ID  | 契约                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------- |
| U1  | 注册表、已加载字典、x18n 语言集合一致；en/zh-Hans 键完全相同、trim 后非空、占位符一致                                           |
| U2  | 已知语言返回对应字典；默认语言正确；未知语言及 `toString`、`constructor` 等特殊值安全回退                                       |
| U3  | 非法默认语言产生可定位错误；路径 zh 映射至 zh-Hans，链接按页面身份及目标语言生成                                                |
| U4  | 插值支持多个、重复占位符；中文和 `$&` 等参数按字面输出；缺参明确失败                                                            |
| U5  | en/zh-Hans 日期显示、UTC 年界与时区一致性；ISO 时间不受 UI 语言影响                                                             |
| U6  | 文章 lang 缺省值依据现有内容核查确定；接受有效内容语言标签（含 en/zh-Hans 及非 UI 语言），拒绝格式非法值；UI 切换不改变内容语言 |

测试通过生产函数接口执行。日期使用少量核实的手写预期，记录 Node/ICU 版本；不能在测试中再次调用同一 Intl 格式化生成答案。复用现有独立时区进程，不增加英文地区选项的产品要求。

### Build artifact tests

建议新增 `tests/build/i18n.test.ts`，复用 [createFixture](../tests/support/build-fixture.ts) 和 [HTML/XML 解析](../tests/support/parse-output.ts)。对一个受控混合语言 fixture 构建一次并共享产物，不按 UI 语言重复构建同一内容。

fixture 包含 11 篇公开文章以触发两页分页，至少一篇英文、一篇简体中文；包含标题、摘要、标签、代码、链接、日期及明确内容语言。额外安排缺省 lang 和非法 lang 的 schema 对照，复用既有 schema suite。原文来源与预期 manifest 独立于生产翻译和排序函数。

| ID  | 实际产物断言                                                                              |
| --- | ----------------------------------------------------------------------------------------- |
| B1  | 英文及 /zh/ 静态 HTML 可读：导航、表单、分页和 skip link 已本地化；404 按实际托管能力验收 |
| B2  | 两套静态页面直接包含对应 UI 文本与属性，参数已替换；作者内容保持原文                      |
| B3  | 英文/中文文章原文正确；原文区域 lang 与 BlogPosting inLanguage 对应文章，而非默认 UI      |
| B4  | 两种 UI 的 html lang、通用页/文章标题与 description 符合 spec；ISO 日期、canonical 正确   |
| B5  | 无前缀与 /zh/ 路由及各自 10+1 分页齐全；canonical、替代链接、sitemap 与 OG URL 一致       |
| B6  | 按建议设计，移除格式不正确的 og:locale；混合 RSS 不宣称单一语言；其他 OG/RSS 内容保留     |

不直接导入生产 `useT` 或 formatter 生成期望。使用明确结构/语义选择器，再断言语言文本；不能用英文 aria-label 作为所有语言场景的唯一定位条件。

### Browser tests

复用 TesterArmy、生产 preview 和现有 fixture/manifest 生命周期。需要 mixed-language fixture 的流程集中在一个建议新增的 `i18n` variant；它构建一次，再在同一产物上切换两种 UI。实施时同步 runner 允许列表、配置与 CI，不把不存在的 variant 当成当前可用命令。

| ID  | 操作                                                    | 确定性断言                                                             |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| E1  | 打开英文页面，点击中文，再点英文                        | UI 文案、属性、html lang、日期正确；URL 在对应无前缀与 /zh/ 地址间切换 |
| E2  | 中文 UI 打开英文文章；英文 UI 打开中文文章              | 标题、摘要、正文、代码、链接和文章语言保持；外围 UI 正确               |
| E3  | 选中文后进入文章、返回列表、翻第二页、刷新              | 系统导航延续 /zh/；刷新按当前 URL 呈现中文；分页链接与文章内容正确     |
| E4  | 在文章、标签、分页页上双向切换，包含可用锚点            | 保留页面身份与可用锚点；不要求未提交表单、焦点或精确滚动位置保持       |
| E5  | 设置与 URL 不同的浏览器语言及保存偏好，直接访问两种地址 | 当前 URL 唯一决定 UI，无偏好或浏览器语言自动跳转                       |
| E6  | 禁用 JavaScript 打开生产页面                            | 英文和中文静态 UI、原文、导航和语言切换链接均可用                      |
| E7  | 键盘操作切换器；360px 下检查两种 UI                     | 可访问名称、选中状态、焦点可见；无页面级横向溢出，控件可操作           |

原文保持通过稳定内容区域的 DOM/text、关键属性与独立 fixture 预期断言，不只比较截图，也不因两次都显示错误原文而通过。语言切换由真实控件触发，不能直接调用应用切换函数替代用户动作。

建议 Chromium desktop/narrow 覆盖主要流程，WebKit narrow 做链接切换、刷新和布局冒烟；不把所有既有 E2E 用例乘以两个语言。中文后备字体和阅读效果另做实际浏览器检查，标注其观察性质；不新增 AI required check 或像素基线承诺。

## Acceptance

目标功能完成时，至少记录以下结果：

- R1–R2 与 D1–D7 对应静态、unit、build、浏览器用例均有实际运行证据。
- 已移除 ko/hu 的 UI 字典、配置与测试引用；历史验证记录可以保留并明确日期。
- 中文切换不修改英文原文，英文切换不修改中文原文；同一文章有两种 UI 地址，canonical 与语言替代关系符合 spec。
- 新字典与实际引用扫描、占位符 `check/apply` 正反对照通过；未覆盖限制明确记录。
- URL 决定语言、刷新、无 JavaScript 和 360px 的行为符合 spec。
- 正式源码和根 dist 未被 fixture 改写，进程/临时目录清理沿用既有机制。
- 项目四项检查、unit、build 与受影响的确定性 E2E 通过；记录提交/工作区状态、命令、退出码和报告路径。
- 本地与远程 CI 结果分别记录；文档存在或 MCP 能连接均不代表功能通过。

当前可执行的基础命令：

```sh
vp run check
vp check
vp run lint
pnpm run i18n:check
pnpm run test:unit
pnpm run test:unit:tz
vp run build
pnpm run test:build
```

新增浏览器 variant 的命令在实现后补录；现有 E2E 用法见 [通用文档](testing.md#running-e2e-tests)。这套设计取代旧的 en/ko/hu 多语言构建建议，原先的“多语言构建搁置”不是本次 UI 切换已完成的标记。

## Agent workflow

| 接口        | 职责                                                              |
| ----------- | ----------------------------------------------------------------- |
| 官方 skills | `x18n` 管理键和翻译，`x18n-check` 处理诊断，`x18n-setup` 处理配置 |
| stdio MCP   | 聊天中的状态、搜索、键详情、翻译提示和范围明确的修改              |
| CLI + JSON  | MCP 的替代操作入口、脚本化检查与严格 CI 验收                      |

项目 `.agents/skills/` 下三个 x18n 目录是到已安装 `@x18n/cli` 官方 skills 的相对符号链接。新 checkout 先安装锁文件依赖；升级包时一起审阅技能变化，不维护独立副本。`.codex/config.toml` 使用 `pnpm exec x18n mcp`，从项目工作目录启动锁定版本。新增连接后重启 MCP 或开启新会话；当前会话工具可用性需单独确认。

stdio 不依赖 UI、HTTP 端口或 token。人工管理可用 `pnpm exec x18n ui`，其独立 HTTP MCP 未配置。

```sh
pnpm exec x18n doctor
pnpm exec x18n status --json
pnpm exec x18n check --strict --json
pnpm exec x18n prompt check
pnpm exec x18n ui
```

翻译任务先检查状态并 search/get 相关键，通过 MCP 写工具或 CLI set/apply 修改字典；rename/delete 先读计划。沿用项目键风格和运行时调用约定，不照搬上游 `t('key')` 示例改写应用。翻译 review 先提出建议，按用户请求应用。

当前工具配置仍是 en/ko/hu；实施迁移时以 [R1](i18n-spec.md#confirmed-decisions) 的 en/zh-Hans 为目标，不能把旧配置当作用户仍要求支持旧语言。占位符配置经实际验证前，不能依赖上游对 placeholder 保护的一般说明。

## Sources

- [x18n agent workflows](https://x18n.dev/agents/workflows)
- [x18n MCP](https://x18n.dev/agents/mcp)
- [Codex skill discovery](https://learn.chatgpt.com/docs/build-skills)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
