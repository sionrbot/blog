# i18n implementation spec

- 更新日期：2026-11-10（Asia/Shanghai）。
- 范围：英文与简体中文 UI；多语言静态路由；博客内容保持原文。
- 测试与工具操作：[i18n testing](../tests/I18N.md)，描述测试范围、执行方法与工具边界。

## Confirmed decisions

以下为用户明确确认的产品要求，不再作为待选择方案：

| ID  | 决定                                        | 验收含义                                                                        |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| R1  | UI 只支持英文、简体中文；英文不分美国／英国 | 字典与语言标记使用 `en`、`zh-Hans`；移除 ko/hu UI 字典及对应配置和测试引用      |
| R2  | 博客内容不翻译                              | 英文原文保持英文，中文原文保持中文；两种 UI 不改变文章内容                      |
| D1  | 采用多语言静态路由                          | 切换通过普通链接导航，允许刷新；不使用客户端原地替换文案                        |
| D2  | 英文无前缀，中文使用 `/zh/`                 | 英文沿用现有地址；语言路径表示 UI 语言，不表示文章原文语言                      |
| D3  | 当前 URL 唯一决定 UI 语言                   | 无前缀页面为英文 UI，`/zh/` 页面为简体中文 UI；不因保存偏好或浏览器语言自动跳转 |
| D4  | 切换至当前页面的另一种 UI 地址              | 保持文章、标签或分页等页面身份；系统生成的站内导航延续当前 UI 语言              |
| D5  | 内容和模板共用                              | 两种路由引用同一份文章和页面模板，不复制两套内容或业务逻辑                      |
| D6  | 明确 UI 文案全部翻译                        | 覆盖现有字典、硬编码 UI、Contact 说明及订阅说明                                 |
| D7  | 作者内容保持原文                            | About 描述及正文、文章内容保持原文；主题演示内容排除                            |

例：`/articles/example/` 为英文 UI，`/zh/articles/example/` 为中文 UI，两者呈现同一篇原文。刷新、收藏和分享通过 URL 保留 UI 语言。

下文的实现约定是收敛后的工程方案，不冒充用户逐项确认的独立产品要求。优先使用 Astro 官方能力，常规工程细节按本方案处理；只有必须改变上述已确认行为时才重新讨论。

## Current state

**Fact — 当前工作区源码与本地构建产物：**

- [语言注册表](../src/i18n/locales.ts)、[字典](../src/i18n/t.ts) 与 x18n 使用 en/zh-Hans；`/zh/` 映射简体中文。
- [共享模板](../src/templates/) 和薄路由入口生成两种 UI；[语言控件](../src/components/common/LanguageSwitcher.astro) 使用普通链接。URL 决定 UI，不读取语言偏好。
- 已有 11 篇文章原文核查均为英文，显式补标 `lang: en`；schema 默认 en，其他有效语言标签可用于文章。
- [首页模板](../src/templates/Home.astro) 仅展示最近 6 篇文章，列表标题和全部文章入口使用字典；首页不渲染 Hero 或 Newsletter。
- Contact、导航与可复用订阅组件的 UI 使用字典；About/Privacy/Terms 原文由共享 MDX 维护。
- 构建产物与浏览器验证覆盖混合语言、11 篇文章分页 fixture。具体命令、结果与限制以测试文档为准，未执行远程 CI。

## Translation boundary

### Translate as UI

- 现有字典键的全部用途，包括可见文本、`aria-label`、placeholder、分页参数、404 和页面描述。
- Header 的 Blog/About/Contact；Footer 的 Legal/Privacy/Terms；首页 Recent writing 和 All posts。
- 普通页面的通用标题，例如 About、Contact、Privacy、Terms。
- Contact 标题、完整说明、表单标签、按钮和本站提供的状态／不可用提示。
- 可复用订阅组件的退订说明、邮箱标签及 placeholder、订阅按钮和不可用提示；首页不展示订阅区块。
- skip link、主题与语言控件、分页、标签列表等可访问名称。

完整说明句可以是 UI，不以句子长度或是否带作者语气判断。组件 props、MDX 文件位置以及当前是否硬编码，也不构成翻译范围依据。

### Preserve original content

- 文章标题、摘要、正文、代码、引用、标签文字、图片说明与文章图片 alt。
- [About 内容](../src/content/pages/about.mdx) 的描述 `Barely Surviving and Deeply Loving`、正文 `Passion, Thinking and Technology.`、正文小标题和正文链接文字。
- 站点名、作者名、品牌名、外部服务名称。
- 表单输入值、字段名、提交地址、隐藏参数；文章 slug 和原始时间戳。

### Implementation conventions

- 首页不再使用 `personalBlog` 和 `newsletterBody`，两个键不保留在英文字典或简体中文字典中。
- `site.description` 暂保留原文。Privacy/Terms 的描述与正文保持原文，不借 UI 翻译改写现有占位政策。
- 日期显示按 UI 语言格式化，继续使用 UTC；`datetime`、JSON-LD 时间戳和正文手写日期不变。
- UI 页标题和已纳入翻译范围的描述随 UI 渲染；文章标题、摘要和分享文案保持原文；About 导语不因复用于 metadata 而另行翻译。
- 浏览器原生校验提示、表单提交后的第三方页面、实际订阅邮件不纳入本站 UI 翻译承诺。
- Styleguide 开发样式指南不纳入本次范围。

## Implementation design

### Astro routing and shared rendering

使用 Astro 内置 i18n，默认语言为 `en`，默认语言不加前缀（`prefixDefaultLocale: false`）。集中映射 URL 语言 `zh` 与字典／HTML／日期语言 `zh-Hans`，避免组件自行转换。

| 层           | 职责                                                   |
| ------------ | ------------------------------------------------------ |
| 路由入口     | 生成静态路径，确定 UI 语言，取得文章或页面数据         |
| 共用页面模板 | 渲染首页、文章、列表、标签、Contact 等页面结构         |
| 布局与组件   | 接收数据，按当前 UI 语言读取字典                       |
| 集中链接工具 | 按页面身份及目标语言生成 URL，复用 `astro:i18n` helper |

- 英文和中文可以使用各自的薄路由入口；布局、内容查询、排序和分页规则各维护一份。
- 每篇公开文章生成两个 UI 页面，引用同一个内容集合条目；不复制 MDX，不按 UI 语言筛选原文语言。
- 列表和标签页使用同一组内容及分页结果，分别生成两种 UI 路径。
- About、Privacy、Terms 的正文从直接路由 MDX 中提取为可复用 MDX 内容，由两种路由入口引用；正文只维护一份。
- 静态 HTML 直接包含对应 UI 的文本和属性；语言切换及导航在无 JavaScript 时仍可用。
- 不引入客户端框架、运行时翻译服务或浏览器 DOM 文案替换机制。

### Links and navigation

- Header、Footer、文章列表、标签、分页、返回链接和面包屑统一使用语言链接工具。
- 切换目标按文章／标签／页码等身份生成，不对完整 URL 做字符串替换，不默认返回首页。
- 作者写在 MDX 正文中的链接保持原值，不增加全文链接改写。因此原文中的无前缀链接可能进入英文 UI；这与系统生成导航延续语言的规则区分处理。
- 切换时通过轻量脚本保留当前锚点（fragment 不发送给静态服务器）；禁用 JavaScript 时仍可切换同一页面，但不承诺携带锚点。语言切换不携带查询参数。全站搜索弹窗使用当前页面的 UI 语言，查询词不写入 URL；切换语言后弹窗关闭，查询词重置。独立 `/search/` 和 `/zh/search/` 路由已移除，不保留兼容入口或重定向。
- 采用普通页面导航，不额外承诺保留未提交表单、控件焦点或精确滚动位置。
- 不新增语言 cookie、localStorage、自动跳转或恢复提示。
- 正常页面生成完整双语 UI 路由，不用语言 fallback 掩盖漏生成页面。
- 无效地址保持 404；404 的语言输出与切换行为结合实际静态托管能力验证，不预先承诺平台尚未支持的行为。

### Dictionaries and formatting

- 保留现有轻量字典、平坦 camelCase 键及 x18n；迁移为 en/zh-Hans，不额外引入运行时翻译库。
- 集中声明语言清单、路径映射和类型；使 Astro、字典、x18n 与测试一致，避免循环导入。
- 支持列表和默认值在构建时校验，非法配置明确失败。字典查询限制为支持集合中的自有键，特殊属性名不得绕过检查。
- 区分字典与辅助模块，调整 glob，避免 helper 被误加载为字典。
- 参数化文案使用共享格式化函数：替换全部重复占位符；缺参明确报错；使用替换回调保留 `$&` 等参数的字面含义。
- section 组件继续通过 props 接收内容，由页面选择翻译；不修改 `src/components/ui/` 的既有 props 签名。
- x18n 的 `{name}` 占位符与实际引用扫描能力按锁定版本核验；移除仅为旧客户端更新设计提出的 DOM 标记扫描要求。
- 不因本次功能升级无关依赖或改写主题样式。

### Content language

- 根 `<html lang>` 表示 UI 语言；文章、英文 About 和首页文章列表中的原文标题／摘要独立标记实际内容语言。
- 在文章 schema 增加可选 `lang`，表示有效 BCP 47 内容语言；不限制为 UI 支持集合，不产生翻译副本。
- 实施时核对现有文章并补标；旧文章的默认兼容值以内容核查为依据，不凭字符比例猜测。
- 原文标题、摘要、正文及图片说明保留内容语言语义；周围翻译控件和格式化日期使用 UI 语言，避免错误继承。
- `BlogPosting.inLanguage` 来自文章语言，不来自当前 UI。

### SEO and feeds

**实施建议，不是 Astro 自动行为：** 对正文相同的双 UI 页面，以无前缀地址作为首选 canonical；两种 UI 地址均保持可访问，用语言替代链接描述对应关系。中文页不因此永久跳转或简单添加 `noindex`。这不承诺搜索引擎分别索引两个页面或展示指定 UI。

- 统一核对 canonical、语言替代链接、sitemap 和 `og:url`，避免互相矛盾。
- 优先使用现有 `@astrojs/sitemap` 集成的语言映射与产物控制能力；先确定首选索引 URL 与变体关系，再核验实际 XML，不能只开启 i18n 选项便认定正确。
- Contact 的主要内容已完整翻译，英文和中文页面各自使用 self-canonical，两个地址均进入 sitemap。文章、列表、首页和共享原文页面继续首选无前缀 canonical；该策略由 `src/i18n/paths.ts` 供页面和 sitemap 共用。
- RSS 保持一份混合原文 feed，不按 UI 复制或筛选；条目使用稳定的无前缀地址。混合内容不错误宣称单一语言。
- `og:locale` 与 HTML 语言标签不是同一格式；不直接输出裸 `en` 或 `zh`，不为地区中性的英文擅自增加地区要求，可省略该可选字段。

## Change map

本次实施范围：

| 区域                                                 | 修改目的                                    |
| ---------------------------------------------------- | ------------------------------------------- |
| `astro.config.mjs`                                   | i18n 路由、sitemap 配置                     |
| `src/i18n/`、`src/config.ts`、`x18n.config.ts`       | 双语字典、语言映射、UI 配置接入、移除 ko/hu |
| `src/pages/`、`src/layouts/`、共享 MDX 内容          | 薄路由入口、共用模板、两套静态页面          |
| `src/components/common/`、`src/components/blog/`     | 导航、语言切换器、分页、可访问名称和 SEO    |
| 首页文章列表、Contact、可复用 Newsletter 组件        | 接入已确认的翻译文案                        |
| `src/utils/posts.ts`、集中链接工具                   | 文章／标签链接、日期                        |
| `src/content.config.ts`、文章语言字段                | 原文语言语义与兼容                          |
| `tests/`、必要的 E2E 配置／CI                        | 单测、构建产物、浏览器验证                  |
| i18n 文档、`docs/content.md`、`AGENTS.md` 等相关说明 | 实施后同步路由、语言与验收规则              |

保留工作区已有未提交的 x18n 接入及其他无关改动。移除旧 UI 语言不改变其他语言的文章原文。

## Validation and delivery

| 层次           | 验证重点                                                                                |
| -------------- | --------------------------------------------------------------------------------------- |
| 字典与单测     | 仅 en/zh-Hans；键和占位符完整；语言映射、链接生成、日期及原文语言正确                   |
| 构建产物       | 两套路由齐全；文章、列表与分页对应；原文一致；标题、语言标记、canonical 和 sitemap 一致 |
| 浏览器         | 文章／标签／分页双向切换；导航延续 UI；直接访问与刷新结果稳定，无偏好跳转               |
| 无 JavaScript  | 英文和中文静态页面均可阅读，语言链接和导航可用                                          |
| 可访问性与布局 | 文本和可访问名称正确，键盘可操作，360px 下两种 UI 无页面级横向溢出                      |

- 使用包含英文／中文原文及跨页列表的受控 fixture；同一次构建生成两种 UI，再验证路由与切换。
- [首页构建测试](../tests/build/i18n.test.ts) 同时验证英文和中文首页：列表标题与全部文章入口本地化、最近 6 篇文章的顺序和链接正确、Hero 文案及 Newsletter 标题和表单不存在；保留中文 skip link 和独立的 Contact 页面检查。
- 通过真实链接触发切换；独立预期验证文章不变，不以生产翻译函数生成全部测试答案。
- 不把所有既有测试机械复制两遍；不继续沿用客户端 DOM 更新、存储异常、URL 不变和表单保留的旧验收要求。
- 修改语言功能时同步 [i18n testing](../tests/I18N.md) 的测试范围与执行方法。

按项目要求完成：

```sh
vp run check
vp check
vp run lint
vp run build
pnpm run i18n:check
pnpm run test:unit
pnpm run test:unit:tz
pnpm run test:build
```

另运行覆盖上述用户流程的相关 E2E，并记录实际报告路径。各命令的实际执行结果见测试文档；门禁清单本身不代表检查通过。

交付顺序：

1. 配置语言、字典、格式化与链接工具，验证单测和字典扫描。
2. 接入共享内容／模板及两种路由，验证构建产物、原文和 SEO 关系。
3. 验证实际导航、双向切换、无 JS、键盘和窄屏布局。
4. 同步文档，报告实际检查结果、改动范围与剩余限制；区分本地验证与远程 CI。

本 spec 取代旧的客户端原地切换建议。已确认的产品决定足以推进实施；常规工程细节不再扩展为逐项产品问答。

## Sources

- [Astro i18n routing](https://docs.astro.build/en/guides/internationalization/)：默认语言前缀、当前语言、fallback。
- [Astro i18n API](https://docs.astro.build/en/reference/modules/astro-i18n/)：本地化链接 helper。
- [Astro i18n recipe](https://docs.astro.build/en/recipes/i18n/)：UI 字典和链接式切换示例。
- [Astro sitemap i18n](https://docs.astro.build/en/guides/integrations-guide/sitemap/#i18n)：语言替代链接及 sitemap 配置。
- [Google localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)：只翻译模板的语言变体、未翻译正文的重复关系。
- [HTML lang](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/lang)：页面与局部内容语言。
- [Open Graph protocol](https://ogp.me/)：可选 `og:locale` 的地区格式。
- [x18n agent workflows](https://x18n.dev/agents/workflows)：结构化查询、修改和验证流程。
