# 界面翻译与作者原文分离，共用内容和模板

本站的双语范围是 UI，博客与其他作者内容保持原文；这是已确认的产品边界。两种语言路由共用内容条目和页面模板，不复制两套内容或业务逻辑，以满足“切换界面但保持原文”的要求。内容语言独立于界面语言，允许使用 UI 支持集合之外的语言；不建立按界面语言划分的文章译本或列表。

## 边界与取舍

- 文章标题、摘要、正文、标签和图片说明保持原文；Contact 功能说明、表单标签和状态提示属于翻译范围，不能仅凭文字长度判断是否为 UI。
- 每篇文章在两种 UI 下引用同一份原文；RSS 保持一个汇集原文标题、摘要和文章链接的订阅源，每篇公开文章只出现一次，条目使用无语言前缀的地址。

## 对 canonical 地址的影响

现有工程方案以正文翻译边界区分首选索引地址：共享原文的页面以无语言前缀地址作为首选 canonical，语言替代链接保留两种 UI 的对应关系。Contact 的主要内容已完整翻译，因此英文和简体中文页面各自采用自身地址作为 canonical，两个地址均进入 sitemap。

- 共享原文的中文 UI 仍可访问，不因 canonical 指向英文 UI 而永久跳转或简单添加 `noindex`。
- canonical、`og:url` 与 sitemap 共用地址选择规则，sitemap 保留语言变体关系；错误页面不参与正常页面的索引规则。
- 这些标记表达本站的首选地址和变体关系，不承诺搜索引擎分别索引两种 UI 或展示指定语言。

## 依据

- **已确认要求：** [i18n 规格 R2、D5、D7](../i18n-spec.md#confirmed-decisions) 明确原文不翻译、内容和模板共享，避免复制两套内容与业务逻辑；[翻译边界](../i18n-spec.md#translation-boundary) 区分 UI 与作者原文。
- **内容实现：** [文章 schema](../../src/content.config.ts) 独立定义内容语言，[共享路径生成](../../src/templates/paths.ts)与[文章模板](../../src/templates/Post.astro)供两种路由复用；[文章布局](../../src/layouts/PostLayout.astro)标记原文语言，[RSS](../../src/pages/rss.xml.ts)使用同一文章集合。
- **工程决策与理由：** [i18n 规格：SEO and feeds](../i18n-spec.md#seo-and-feeds) 明确区分共享原文与完整翻译的 Contact，并将该策略标为工程建议，而非 Astro 自动行为或独立确认的产品要求。
- **实现：** [canonicalPath](../../src/i18n/paths.ts) 对 Contact 保留当前语言路径，对其他页面返回无语言前缀的页面身份；[SEO 组件](../../src/components/common/SEO.astro) 和 [sitemap 配置](../../astro.config.mjs) 使用同一规则。
- **验证契约：** [语言构建测试](../../tests/build/i18n.test.ts) 检查 Contact 的 self-canonical、两种 Contact 地址进入 sitemap，以及共享原文页面的首选地址。
