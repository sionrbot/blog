# 由 URL 决定界面语言，使用静态页面导航

本站提供英文与简体中文 UI，博客及其他作者原文保持原有语言；这两项是已确认的产品边界。采用 URL 唯一决定界面语言的静态页面：英文沿用无语言前缀地址，简体中文使用 `/zh/`，两种入口共用内容和页面模板，通过普通链接切换同一页面身份。这样刷新、收藏和分享可以通过 URL 保留界面语言，英文原有地址也得以延续；不采用客户端原地替换文案或按浏览器语言、保存偏好自动跳转。

## 边界与取舍

- 语言切换允许整页导航，不承诺保留未提交表单、控件焦点或精确滚动位置；无 JavaScript 时仍可访问对应语言的同一页面。
- 保留当前锚点依赖轻量脚本；语言切换不携带查询参数。搜索采用全站弹窗，查询词不写入 URL，也不跨页面或语言切换保留；独立搜索页及其 `q` 保留规则已移除。搜索规则见[全文搜索](../search.md)。
- 语言切换改变界面变体，不改变文章原文；内容边界见 [ADR-0002](0002-share-original-content-across-ui-languages.md)。
- 系统导航延续当前 UI 语言，作者正文中的链接保留原目标。

## 依据

- **已确认要求：** [i18n 规格 R1、R2、D1–D5、D7](../i18n-spec.md#confirmed-decisions) 明确语言范围、原文边界、静态导航、URL 优先和内容共享，并说明刷新、收藏、分享保留语言的用途。
- **工程约定：** [路由与共享渲染](../i18n-spec.md#astro-routing-and-shared-rendering)、[链接与导航](../i18n-spec.md#links-and-navigation) 记录无脚本可用性及导航取舍；这些是规格中的工程方案，不另称为用户逐项确认的要求。
- **实现：** [Astro 配置](../../astro.config.mjs)、[英文文章入口](../../src/pages/articles/[slug].astro)、[中文文章入口](../../src/pages/zh/articles/[slug].astro) 使用同一套[路径生成](../../src/templates/paths.ts)和[文章模板](../../src/templates/Post.astro)；[语言选择器](../../src/components/common/LanguageSwitcher.astro) 使用普通链接并补充锚点。
- **验证契约：** [语言构建测试](../../tests/build/i18n.test.ts) 和[导航浏览器测试](../../tests/e2e/deterministic/i18n/navigation.e2e.ts)。
