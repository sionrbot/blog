# 质量保证：从开发到交付

本文描述仓库配置的检查与测试契约。**事实**指可在所链接源码或配置中复核的行为；**推断**说明这些事实的含义。配置存在、测试包含某项断言，与某次运行实际成功是不同证据：判断一次变更是否通过，应读取对应运行的退出状态、报告及 CI 记录，而不能仅凭测试文件存在。[命令入口](../package.json)、[测试运行报告](../tests/support/run-e2e.ts)、[交付核验要求](agents/closeout.md)

## 0. 需求与设计时：明确可验收的行为

**事实：**语言规格把已确认的产品要求与工程实现约定分开，并列出验收含义；相关 ADR 记录 URL 决定界面语言、界面翻译与作者原文分离的决策，语言测试指南将这些契约映射到静态、单元、构建和浏览器检查。新增或修改行为时，可沿这条对应关系确定受影响的断言。[语言规格](i18n-spec.md)、[语言路由决策](adr/0001-url-determines-ui-language.md)、[内容共享决策](adr/0002-share-original-content-across-ui-languages.md)、[语言测试契约](../tests/I18N.md)

## 1. 开发时：先检查源码和快速逻辑

**事实：**项目用 Astro 严格 TypeScript 配置；`vp run check` 执行 `astro check`，`vp check` 负责 Vite+ 检查，`vp run lint` 执行 Oxlint 与 ESLint，ESLint 还加载 Astro 模板规则。Oxfmt 配置包含 Astro 与 Tailwind 类排序。新检出应先生成 Astro 类型，再做其余检查。[tsconfig.json](../tsconfig.json)、[package.json](../package.json)、[vite.config.ts](../vite.config.ts)、[eslint.config.js](../eslint.config.js)、[AGENTS.md](../AGENTS.md)

**事实：**常规本地验证顺序如下；构建使用 `vp run build`，因为项目规则明确区分 Astro 脚本与 Vite+ 内建命令。完整测试的操作说明见现有测试指南。[AGENTS.md](../AGENTS.md)、[测试指南](../tests/TESTING.md)

```sh
vp install
vp run check
vp check
vp run lint
pnpm run i18n:check
pnpm run test:unit
pnpm run test:unit:tz
vp run build
pnpm run test:build
```

**事实：**单元测试由 `vp test --project unit` 选择 `tests/unit/**/*.test.ts`，主要检查文章与标签路径、部署子路径、日期和语言逻辑，也包含发布与部署工具的契约测试。日期专用命令分别在 UTC、America/Los_Angeles、Asia/Singapore 子进程运行，检查时区变化下的日期输出。单元层把 `astro:content` 指向会拒绝集合访问的 stub，内容集合必须进入真实构建测试。[测试项目配置](../vite.config.ts)、[文章路径](../tests/unit/posts.test.ts)、[部署子路径](../tests/unit/base-path.test.ts)、[日期](../tests/unit/dates.test.ts)、[时区运行器](../tests/support/run-date-timezones.ts)、[语言逻辑](../tests/unit/i18n.test.ts)、[内容 stub](../tests/support/astro-content.stub.ts)、[发布工具测试](../tests/unit/release.test.ts)

**事实：**翻译检查使用 `x18n check --strict`，扫描字面量 `t.key`，自定义识别 `{name}` 占位符。字典单元测试还要求键集合一致、值去空白后非空；工具集成测试包含未知键、缺失/空翻译、占位符变化、未使用键和拒绝错误写入的控制组。[x18n 配置](../x18n.config.ts)、[命令入口](../package.json)、[字典测试](../tests/unit/i18n.test.ts)、[工具探针](../tests/build/tooling/x18n-tooling.test.ts)

## 2. 内容或模板变更后：检查真实构建产物

**事实：**构建测试使用独立的 `build` 项目，单 worker、禁止文件并行，测试和 hook 超时均为 180 秒。需要修改内容、配置或故意引入错误的场景通过临时副本构建，隔离源码、输出和缓存；fixture 复用依赖目录，结束时清理临时目录并保留诊断。部分默认路由和隔离断言依赖根目录 `dist`，因此先构建当前源码。[测试配置](../vite.config.ts)、[fixture 实现](../tests/support/build-fixture.ts)、[默认路由测试](../tests/build/routes.test.ts)、[隔离测试](../tests/build/tooling/isolation.test.ts)

| 验证对象       | 源码中定义的契约（事实）                                                                                      | 一手证据                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 发布与分页     | 生产页面、列表、feed 等排除草稿；dev 可见草稿；顺序、标签归一化、分页内容和相邻链接准确                       | [publication](../tests/build/publication.test.ts)、[pagination](../tests/build/pagination.test.ts)                 |
| 内容 schema    | 非法日期、语言和缺失图片替代文本失败，并用修正后的内容验证成功路径；缺省 tags、draft、lang 正确               | [schema](../tests/build/schema.test.ts)、[description 控制组](../tests/build/schema.test.ts)                       |
| 渲染           | Markdown/MDX 数学与化学公式、错误公式保留、按需 KaTeX CSS、表格、任务复选框和共享页面数学样式                 | [rendering](../tests/build/rendering.test.ts)、[page-math](../tests/build/page-math.test.ts)                       |
| SEO 与部署路径 | canonical、OG、JSON-LD、RSS、sitemap、robots 一致；JSON-LD 转义；根路径和子路径；旧文章地址无重定向地返回 404 | [seo](../tests/build/seo.test.ts)、[base-path](../tests/build/base-path.test.ts)                                   |
| 双语页面       | 中英文 UI、原文内容与语言属性、页面身份、导航配置、canonical/hreflang、RSS 原文去重                           | [i18n](../tests/build/i18n.test.ts)、[navigation-config](../tests/build/navigation-config.test.ts)                 |
| 搜索           | Pagefind 索引只收录已发布原文一次、正确部署前缀、查询结果与静态运行时资源                                     | [search](../tests/build/search.test.ts)                                                                            |
| 测试基础设施   | fixture 间缓存/内容隔离，不改变源码和根 dist；SIGINT/SIGTERM 后清理子进程与临时目录且保留日志                 | [isolation](../tests/build/tooling/isolation.test.ts)、[interruption](../tests/build/tooling/interruption.test.ts) |

**事实：**普通只读构建使用 `createBuiltFixture({ name, posts, siteUrl })`，集中校验构建成功并在失败时清理临时目录；非法 schema、源码配置编辑及 dev/preview/进程场景使用底层 `createFixture`。发布与分页断言继续检查草稿排除、精确分页内容、相邻地址和同源链接；fixture 不再包含业务源码变异开关。一次性敏感度验证应在临时副本确认构建成功、指定断言拒绝错误输出，并在恢复后通过同一契约，证据保存到忽略报告目录。[fixture](../tests/support/build-fixture.ts)、[发布契约](../tests/build/publication.test.ts)、[分页契约](../tests/build/pagination.test.ts)、[测试指南](../tests/TESTING.md)

## 3. 交互变更后：在浏览器里检查用户行为

**事实：**生产回归通过 `test:e2e` 与 `test:e2e:ai` 包装器运行 Astro preview。默认变体读取根 `dist`，其他变体建立独立 fixture；运行器验证 manifest，默认选择 Chromium 的 desktop（1280×800）与 narrow（360×800），可另选 WebKit（360×800）。配置为单 worker、零重试并启用 trace。[命令入口](../package.json)、[运行器](../tests/support/run-e2e.ts)、[目标配置](../tests/support/e2e-targets.ts)、[fixture 变体](../tests/support/e2e-variants.ts)

| 变体             | 确定性浏览器契约（事实）                                                                                                                                          | AI 补充（事实）                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| default          | 文章/标签导航、404、主题持久化与系统变化、存储失败、键盘跳转与焦点、360px 布局、禁用表单、搜索空结果/竞态/不可用索引。[源码](../tests/e2e/deterministic/default/) | 可见导航发现文章与标签、选择主题、理解不可用表单，并保留精确 URL/控件断言。[源码](../tests/e2e/ai/default/) |
| rendering        | 宽表格、代码、公式局部滚动，页面不横向溢出，嵌入控件可用。[源码](../tests/e2e/deterministic/rendering/reading.e2e.ts)                                             | 将内容定位到视口后，以截图判断文字对比、遮挡和可读性。[源码](../tests/e2e/ai/rendering/reading.e2e.ts)      |
| configured-forms | 原生必填/email 验证、POST 字段、隐藏字段、弹窗和单次提交。[源码](../tests/e2e/deterministic/configured-forms/submission.e2e.ts)                                   | 用目标驱动方式填写，仍复用精确请求断言。[源码](../tests/e2e/ai/configured-forms/submission.e2e.ts)          |
| i18n             | 双向切换、页面/锚点身份、URL 优先、刷新、阻止脚本时导航、下拉菜单与 360px 布局。[源码](../tests/e2e/deterministic/i18n/navigation.e2e.ts)                         | 不提供 AI 变体，运行器显式拒绝该组合。[源码](../tests/support/run-e2e.ts)                                   |

**事实：**表单 fixture 使用假凭据，提交请求被拦截；断言检查方法、payload 与请求数量。因此这层验证表单客户端契约，并不验证第三方服务实际投递。[表单 fixture](../tests/support/e2e-variants.ts)、[拦截与断言](../tests/support/e2e-forms.ts)

**事实：**浏览器基线使用站点根路径，运行前按指南安装浏览器并以相同 SITE_URL 构建。生产子路径另由构建测试验证。[测试指南](../tests/TESTING.md)、[CI 根路径配置](../.github/workflows/e2e.yml)、[子路径断言](../tests/build/base-path.test.ts)

```sh
pnpm exec e2e-web install chromium webkit
SITE_URL=https://sionrbot.github.io vp run build
pnpm run test:e2e -- --target desktop,narrow,webkit
pnpm run test:e2e -- --variant rendering --target desktop,narrow,webkit
pnpm run test:e2e -- --variant configured-forms --target desktop,narrow,webkit
pnpm run test:e2e -- --variant i18n --target desktop,narrow,webkit
```

**事实：**AI 配置从环境或 `.env.e2e` 获取凭据，默认模型为 `gpt-6.1-sol`，可由 `E2E_MODEL` 覆盖，限制步骤与模型调用数。交互式 E2E 未提供 manifest 时可启动桌面 dev target，固定 `APP_URL` 可复用本地 dev；生产回归应使用上述包装器。[AI 配置](../e2e.ai.config.ts)、[交互配置](../e2e.config.ts)、[使用说明](../tests/TESTING.md)

## 4. 提交 PR 后：组合检查成为门禁

**事实：**CI 与 E2E workflow 都监听 PR 和手动触发，不监听 main push。CI 先顺序完成 Astro check、Vite+ check、ESLint、翻译、单元/时区测试与构建；随后 build-tests 和 site-audit 并行消费同一个 artifact ID。`quality` 用 `always()` 汇总，各必需 job 必须成功；普通 PR 允许跳过专门的 release-builds。[CI](../.github/workflows/ci.yml)、[E2E](../.github/workflows/e2e.yml)

**事实：**站点审计对配置中存在的首页、typography sampler、about 页面各运行 Lighthouse 三次，performance、accessibility、best-practices、SEO 最低分均为 0.95；linkinator 仅检查内部链接。E2E 的四个变体均运行三个确定性目标，非 i18n 变体再运行两个 Chromium AI 目标，最终脚本按步骤原始 outcome 检查，不能由 AI 成功掩盖浏览器失败。AI 阶段没有缺少 secret 就降级跳过的配置。[Lighthouse](../lighthouserc.cjs)、[CI](../.github/workflows/ci.yml)、[E2E](../.github/workflows/e2e.yml)、[E2E 聚合器](../scripts/verify-e2e-job.ts)、[聚合器测试](../tests/unit/e2e-job.test.ts)

**事实：**Release PR 额外分别构建 Pages 与 Workers 产物，对两者执行 base-path/routes/seo 测试，Workers 再做部署 dry-run，并记录产物证据。Dependabot 常规更新按上海时区每周二 02:00 调度；实际安全更新开关与分支保护设置属于仓库远端设置，文档要求配置不等于已经启用。[Release PR job](../.github/workflows/ci.yml)、[Dependabot](../.github/dependabot.yml)、[发布设置要求](releasing.md)

## 5. 发布与部署：让已验证内容和交付内容对应

**事实：**发布脚本验证最新 PR 运行和 attempt、head、被测 Git tree 与合并 tree、归档摘要等证据，先准备草稿 Release 与归档/manifest，再公开发布。部署准备限定最新稳定 Release，下载并验证现成产物；部署 workflow 分别处理 Pages 和 Workers，不重新构建。[发布产物验证](../scripts/release-artifacts.ts)、[发布流程](../scripts/release.ts)、[部署准备](../scripts/deploy-release.ts)、[部署 workflow](../.github/workflows/deploy.yml)

**推断：**这里保证的重点是“部署字节可追溯到已测试源码树”，依据是发布前的 tree/digest 检查与部署复用归档，而不是把合并成功视为生产成功。交付流程要求分别核对 PR 检查、Release、两个部署目标及本地同步；closeout 脚本成功也不能替代这些独立判断。[证据生成](../scripts/release-evidence.ts)、[产物验证](../scripts/release-artifacts.ts)、[交付流程](agents/closeout.md)

## 6. 失败诊断与覆盖边界

**事实：**构建 fixture 将 manifest、构建日志、退出结果和解析后的配置放入 `tests/test-results/build/`；E2E 包装器把 manifest、runner/result、编排错误和 preview 日志放入 `.e2e/runs/`，并配置 JUnit 和 trace。CI 在相关失败/非取消条件下上传诊断。排障应优先读取失败断言、退出状态和对应日志，而不是仅凭 workflow 已结束判断成功。[fixture](../tests/support/build-fixture.ts)、[E2E runner](../tests/support/run-e2e.ts)、[报告配置](../tests/support/e2e-targets.ts)、[CI](../.github/workflows/ci.yml)、[E2E](../.github/workflows/e2e.yml)

以下边界必须在解释测试结果时保留：

- **事实：**Lighthouse 只采样配置页面，内部链接检查跳过外站；不能据此宣称全站性能或外链可用。[Lighthouse](../lighthouserc.cjs)、[链接命令](../.github/workflows/ci.yml)
- **事实：**浏览器目标是固定 viewport 的 Chromium/WebKit；可读性使用模型视觉判断，未建立像素差异基线。**推断：**这些结果不能证明真实手机、全部浏览器或所有辅助技术兼容。[目标配置](../tests/support/e2e-targets.ts)、[视觉断言](../tests/e2e/ai/rendering/reading.e2e.ts)、[键盘测试](../tests/e2e/deterministic/default/accessibility.e2e.ts)
- **事实：**无脚本场景用 CSP 阻止脚本，并非禁用浏览器 JavaScript；翻译使用扫描器匹配文本引用，空白翻译的工具缺口由字典单元测试补充。[浏览器场景](../tests/e2e/deterministic/i18n/navigation.e2e.ts)、[扫描器](../x18n.config.ts)、[工具探针](../tests/build/tooling/x18n-tooling.test.ts)、[字典测试](../tests/unit/i18n.test.ts)
- **事实：**部署 workflow 没有部署完成后请求远端页面的 smoke 步骤。**推断：**本地 preview 的 404、静态产物正确和上传成功，均不能单独证明托管平台实时路由正确；判断线上可用性需要独立的部署后请求证据。[部署 workflow](../.github/workflows/deploy.yml)、[preview 路由测试](../tests/build/base-path.test.ts)
