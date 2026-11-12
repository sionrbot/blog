# 质量保证体系设计与维护约束

本文保留测试与 CI/CD 的设计依据及后续修改时必须维持的契约。当前命令、执行顺序和诊断入口见[质量保证说明](quality-assurance.md)与[测试指南](../tests/TESTING.md)；发布分支和两类部署遵循[发布分支规格](release-branch-spec.md)与[发布指南](releasing.md)。

## 业务契约与主要验证位置

完整性按业务契约审核。删除断言时应说明由哪条保留断言承担保障，或对应实现为何已经退役。测试期望不调用生产排序、翻译、分页或链接函数生成。

| 契约               | 主要验证位置                                                  | 必须保留的场景与其他层职责                                                                                                     |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 公开集合与草稿     | `tests/build/publication.test.ts`                             | 生产各公开输出排除草稿；dev 可见；按发布时间排序；搜索索引另外验证不泄漏草稿                                                   |
| 标签归组与文章链接 | `tests/unit/posts.test.ts`、`tests/build/publication.test.ts` | 大小写/空白归一化、非 ASCII 标签、同义标签归组、文章 ID 保留；浏览器保留文章→标签→列表链路                                     |
| 分页               | `tests/build/pagination.test.ts`                              | 保留 1/10/11/20/21 篇边界、精确每页内容、页数、相邻链接、链接同源；i18n 只补代表性跨页切换                                     |
| 内容 schema        | `tests/build/schema.test.ts`                                  | 日期、语言、摘要长度、heroAlt、默认值；非法输入命中对应字段，并有修正后的合法控制                                              |
| 界面语言与原文     | `tests/unit/i18n.test.ts`、`tests/build/i18n.test.ts`         | URL 决定 UI；原文及内容语言保持；页面身份不变；字典键、空白值、占位符及 fallback                                               |
| 日期               | `tests/unit/dates.test.ts`                                    | UTC 输出、语言格式、跨年边界；UTC/Los Angeles/Singapore 独立进程运行                                                           |
| SEO 与订阅输出     | `tests/build/seo.test.ts`                                     | canonical/hreflang、OG、JSON-LD、RSS、sitemap、robots；Contact 与共享原文的不同策略；脚本结束标记转义                          |
| 部署路径与路由     | `tests/build/base-path.test.ts`、`routes.test.ts`             | 根与子路径、资源前缀、旧路由无重定向 404；保留跨层接线，不重复整套 SEO 规则                                                    |
| 搜索索引           | `tests/build/search.test.ts`                                  | 真实 Pagefind 中英文查询、公开原文去重、metadata、部署前缀和资源服务                                                           |
| 搜索交互           | `tests/e2e/deterministic/default/search.e2e.ts`               | 全局弹窗、URL 不变、焦点/滚动恢复、同页查询保留、跨语言查询重置、空查询/无结果、追加结果、竞态、摘要安全、索引不可用、窄屏表现 |
| 内容渲染           | `tests/build/{rendering,page-math}.test.ts`                   | Markdown/MDX 数学、错误公式、按需样式、表格、复选框、共享页面与嵌入区块                                                        |
| 主题与可访问交互   | `tests/e2e/deterministic/default/`                            | 显式主题选择与系统偏好、刷新、存储失败、skip link、键盘焦点、360px 布局                                                        |
| 表单               | `tests/e2e/deterministic/configured-forms/`                   | 必填/email 约束、精确 POST 字段和方法、提交次数、新窗口；默认未配置表单禁用，不真实投递                                        |
| 浏览器语言切换     | `tests/e2e/deterministic/i18n/navigation.e2e.ts`              | 双向切换、页面身份与锚点保留、查询参数丢弃、刷新、控件焦点、脚本阻断时的导航与窄屏布局                                         |
| 测试工具可靠性     | 隔离、进程退出、输出解析、x18n tooling 与依赖兼容测试         | 保证 fixture 不改真实源码/dist，失败可诊断且能清理；与业务报告区分，不自动新增 CI job                                          |

## 测试组织与 fixture

**事实：**[测试配置](../vite.config.ts)保留 `unit` 与 `build` 两个项目，递归收集相应目录；工具测试位于各自 `tooling/` 子目录。构建项目最多并行两个文件，同一文件内测试顺序执行。业务分组用于组织契约与报告，不直接对应 CI job。

**事实：**[构建 fixture](../tests/support/build-fixture.ts)提供正常只读构建的 `createBuiltFixture({ name, posts, siteUrl })`，集中处理构建成功与失败清理；非法 schema、配置编辑、dev/preview 和进程场景使用底层 `createFixture`。同一输入可以共享只读构建产物，需要修改输入时使用隔离副本。[隔离](../tests/build/tooling/isolation.test.ts)与[中断](../tests/build/tooling/interruption.test.ts)测试验证源码、根 dist、缓存和子进程的边界。

维护时遵循以下规则：

- 每个用例名称表达可定位的业务规则；完整用户旅程可以包含多个断言。
- 分页保留 1/10/11/20/21 篇边界、精确每页内容、实际页数、相邻链接与同源检查。i18n 用代表性的多页场景验证语言接线，不复制全部分页边界。
- SEO 套件承担 canonical 等主策略，部署路径与 i18n 套件验证跨层接线。草稿在文章、列表、RSS、搜索中的排除分别验证。
- fixture 不包含草稿过滤或分页源码的变异开关。需要验证测试敏感度时，在临时副本中注入目标回归，先确认构建成功，再确认指定断言失败，恢复后重新验证；报告保存在忽略目录。
- 非法 schema 用例必须命中对应字段，并有合法控制组。隔离、清理和失败诊断属于 fixture 契约。

## 浏览器与专项检查

**事实：**[CI](../.github/workflows/ci.yml)对 `default`、`i18n`、`configured-forms`、`rendering` 执行 Chromium desktop、Chromium 360px 与 WebKit 360px；隔离的 `production-path` 只执行 desktop。[目标配置](../tests/support/e2e-targets.ts)与[运行器](../tests/support/run-e2e.ts)统一 preview、manifest 和报告。

**事实：**[生产子路径贯通](../tests/e2e/deterministic/production-path/navigation.e2e.ts)使用真实 `/blog/` preview 串起首页、文章、Pagefind 搜索和中文原文页面。搜索弹窗保持文章 URL；切换语言后新页面的搜索输入为空，再次查询得到对应 UI 语言下的文章地址。

确定性测试承担导航、主题、语言、搜索、键盘、布局和表单请求契约。表单使用假凭据与拦截请求，检查方法、字段、次数与原生校验。AI 仅承担 rendering 截图可读性专项，Lighthouse 保留为按需性能与可访问性检查，两者均不属于必需 PR 检查。操作和覆盖边界见[质量保证说明](quality-assurance.md#3-交互变更后在浏览器里检查用户行为)。

## CI 的设计取舍

**事实：**[CI](../.github/workflows/ci.yml)在单个 `verify` job 内用明确步骤依次执行检查。纯开发文档变更只检查格式；其他变更完整验证；分类不确定时完整验证。[分类脚本](../scripts/ci-scope.ts)及其[测试](../tests/unit/ci-scope.test.ts)定义白名单与比较规则。PR 标题检查独立响应标题编辑。

必需步骤直接依赖命令退出码；诊断上传不承担业务验收。根构建产物在同一 job 内复用。测试契约、文件目录或报告分类不要求增加 CI job，也不要求通用调度器或结果聚合门禁。

**推断：**串行步骤使后续检查等待前置检查，普通失败后不再执行后续验证；重跑会重复部分已成功工作。这由 workflow 的顺序和默认成功条件决定。若要调整并行度，应依据实际反馈时间与失败诊断需求，不以 YAML 行数或测试数量代替质量判断。

## 固定源码的交付边界

**事实：**[发布 workflow](../.github/workflows/release.yml)支持两类固定候选：合并到 `release` 的软件版本 PR，以及手动指定当前 `release` HEAD 的内容部署。两类候选均重新验证固定 SHA，并分别构建 Pages `/blog/` 与 Workers 根路径产物；软件候选随后创建或确认公开 Release，内容候选沿用已有软件基线。内容累计差异由[白名单校验](../scripts/release-content.ts)约束。

以下约束维持交付可核验性：

1. 固定候选 SHA、软件 version/tag/tag SHA；验证与构建使用同一候选，不从移动中的分支另取源码。
2. Pages 输出在 Workers 构建前独立保存；两站只部署当前 run/attempt 的对应产物。
3. 软件版本公开之前完成验证与两个目标构建；历史 tag、Release 与资产保持不变。
4. 两站独立检查最新软件基线与当前 `release` HEAD，再分别部署和 smoke；过时候选跳过，跳过不代表部署成功。
5. `release-production` 队列覆盖验证、发布和部署，并与 `release-pr-release` 版本维护分离。
6. 临时故障通过原 run 的 Re-run all jobs 重新验证构建；源码缺陷经修复生成新候选。未公开软件候选的退役、内容部署资格和软件升级分别遵循[恢复指南](releasing.md#inspect-and-retry)。

**推断：**固定源码重建保证每次部署消费该次验证后的产物，不保证跨次构建的字节完全相同。依据是 workflow 每次安装锁定依赖、重新构建，且部署拒绝旧 attempt 输出。[发布 workflow](../.github/workflows/release.yml)

## 修改与验收

修改测试或工作流时，执行[基础检查](../AGENTS.md#commands)和受影响契约的测试；生产构建与根路径浏览器基线使用一致的 `SITE_URL`，本地验证后按[测试指南](../tests/TESTING.md)恢复默认生产构建。删除机制时同时处理实现、专属测试、工作流调用和文档引用。

运行结果、耗时与敏感度证据保存在报告或 CI 记录中。项目指南描述运行方式与约束；交付时分别核对 PR 检查、软件发布（如适用）、两站部署和线上 smoke，遵循[收尾指南](agents/closeout.md)。
