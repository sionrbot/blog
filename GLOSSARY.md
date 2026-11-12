# Sionrbot 博客

本站发布作者原文，并提供英文和简体中文界面。以下术语区分文章内容、界面语言、读者访问的页面与站点交付。

## Language

### 内容与发布

**文章（Post）**：
具有标题、摘要、正文和发布日期的博客内容；同一篇文章可以在两种界面中阅读，但仍是一份原文。[依据](docs/content.md#blog)
_Avoid_: 用“页面”代指文章本身；用“中文版文章”代指中文界面中的文章。

**作者原文（Authored content）**：
由作者维护、切换界面语言时保持原样的内容，包括文章标题、摘要、正文、标签、图片说明，以及 About 等独立页面的原文。[依据](docs/i18n-spec.md#preserve-original-content)
_Avoid_: 将“原文”等同于英文；将所有可见文字都称为 UI 文案。

**草稿（Draft）**：
尚未纳入公开站点的文章；可在开发预览中阅读，但不出现在正式生成的文章页面、列表、标签页或订阅源中。[依据](docs/content.md#blog)、[发布契约](tests/build/publication.test.ts)
_Avoid_: 将“草稿”等同于有未来发布日期的文章。

**公开文章（Published post）**：
纳入公开站点的非草稿文章；文章列表按发布日期从新到旧排列。[依据](src/utils/posts.ts)
_Avoid_: 用“已部署文章”代指公开文章；公开资格不表示某次部署已经完成。

**文章标签（Tag）**：
作者为文章指定的主题文字，用于把相关文章归在同一个标签页中；标签文字属于原文，不随界面语言翻译。[依据](docs/content.md#standalone-pages-and-ui)、[标签归组](src/templates/paths.ts)
_Avoid_: 与开发工作使用的“议题标签”混用。

### 站点交付

**晋级（Promotion）**：
将选定的一批开发成果纳入发布线，使其获得正式发布资格；晋级不表示已经上线。[依据](docs/release-branch-spec.md#晋级与版本管理)
_Avoid_: 用“部署”代指晋级。

**软件发版（Software release）**：
以软件版本号确认一份软件及其随附内容的发布；软件版本号不区分随后独立上线的内容变化。[依据](docs/release-branch-spec.md#决策与范围)
_Avoid_: 将每次文章上线称为新的软件版本。

**内容部署（Content deployment）**：
在已公开软件版本的基础上，将符合内容范围的变化独立上线，不增加软件版本号。[依据](docs/release-branch-spec.md#内容范围)
_Avoid_: 用“patch 发版”代指纯文章上线。

**发布候选（Release candidate）**：
获准接受发布验证的一份确定源码，分为软件候选和内容候选；候选资格不表示验证或部署已经成功。[依据](docs/release-branch-spec.md#统一入口与候选记录)
_Avoid_: 将发布候选等同于软件预发布版本。

**回流（Back-merge）**：
将发布线产生的版本记录和修复同步回日常开发线；回流与上线结果分别判断。[依据](docs/release-branch-spec.md#恢复与回流)
_Avoid_: 用“回流完成”表示“部署成功”。

### 语言与页面

**UI 文案（UI text）**：
帮助读者导航、操作或理解站点功能的文字，包括按钮、表单说明、通用页面标题和可访问名称；完整说明句也可以是 UI 文案。[依据](docs/i18n-spec.md#translate-as-ui)
_Avoid_: 仅凭句子长度或是否具有作者语气，判定文字属于作者原文。

**界面语言（UI locale）**：
当前页面的 UI 文案与日期显示采用的语言，本站提供英文和简体中文；它不决定文章原文的语言。[依据](docs/i18n-spec.md#confirmed-decisions)、[日期显示约定](docs/i18n-spec.md#implementation-conventions)
_Avoid_: 含混的“网站语言”；需要与内容语言区分时只说“语言”。

**内容语言（Content language）**：
作者原文实际使用的语言，独立于界面语言，也不限于英文和简体中文。[依据](docs/content.md#blog)
_Avoid_: 用“界面语言”或“翻译目标语言”代指内容语言。

**页面身份（Page identity）**：
读者正在访问的具体页面，例如某篇文章、某个标签页或文章列表的某一页；切换界面语言不会改变这个身份。[依据](docs/i18n-spec.md#confirmed-decisions)
_Avoid_: 将界面语言不同的两个地址视为两篇不同文章。

**界面语言变体（UI language variant）**：
同一页面身份在不同界面语言下的呈现；两种变体共享作者原文，Contact 的功能说明则属于需要翻译的 UI 文案。[依据](docs/i18n-spec.md#astro-routing-and-shared-rendering)、[翻译范围](docs/i18n-spec.md#translate-as-ui)
_Avoid_: “文章译本”；没有实际翻译的内容不称为译本。

### 导航与订阅

**系统导航（System navigation）**：
站点提供的导航入口，包括页头、页脚、文章列表、标签、分页、返回链接和面包屑；站内目标延续当前界面语言。[依据](docs/i18n-spec.md#links-and-navigation)
_Avoid_: 将作者写在正文中的链接也归为系统导航。

**正文链接（Authored link）**：
作者写在原文中的链接，其目标在两种界面中保持原值，因此可能带读者进入另一种界面语言。[依据](docs/i18n-spec.md#links-and-navigation)
_Avoid_: 与站点自动提供的导航链接混用。

**文章订阅源（RSS feed）**：
汇集公开文章的单一订阅源，每篇只收录一次，标题和摘要保持原文，并提供文章链接；不按界面语言拆分。[依据](src/pages/rss.xml.ts)、[订阅源契约](tests/build/i18n.test.ts)
_Avoid_: 与通过邮箱订阅的 Newsletter 混用。
