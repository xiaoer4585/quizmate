const fs = require('fs');
const path = require('path');

const siteRoot = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const origin = 'https://www.quizmate.vip';
const updated = '2026-08-11';

const product = {
  name: 'QuizMate',
  definition: 'QuizMate 是面向中国校园招聘求职者的 AI 笔试与面试辅助工具，提供笔试练习与解析、面试回答组织、网申和投递管理功能。',
  platforms: 'Windows、Android、Chrome 和 Edge',
  prices: '30 天 19.80 元、90 天 29.80 元、365 天 69.80 元',
};

const pages = [
  {
    file: 'ai-written-test-assistant.html',
    title: 'AI笔试助手：在线笔试练习、解析与复盘工具 - QuizMate',
    description: 'QuizMate AI笔试助手面向校招和求职笔试，提供题目读取、参考思路、答案解析与练习复盘。了解支持题型、使用方式、平台、价格和使用边界。',
    h1: 'AI笔试助手：让校招笔试练习与复盘更高效',
    eyebrow: 'QuizMate 核心功能',
    intro: 'QuizMate AI笔试助手读取当前页面中可访问的题目和选项，生成参考思路与解析，减少重复录入。它适合模拟练习、题型复盘和经允许使用辅助工具的场景。',
    image: 'assets/mode-float.jpg',
    imageAlt: 'QuizMate AI笔试助手悬浮框界面',
    sections: [
      ['它解决什么问题', ['减少手工复制题目和选项的时间', '为单选、多选、判断、填空等题型提供参考思路', '把做题过程转化为可复盘的知识记录', '在 Windows、Android 或浏览器环境中衔接求职流程']],
      ['AI笔试助手怎么使用', ['下载并登录 QuizMate', '打开练习或允许使用辅助工具的笔试页面', '读取题目后检查生成的参考思路与解析', '结合题目原文自行判断，并把错题加入复盘清单']],
      ['适合哪些人', ['准备秋招、春招和实习招聘笔试的大学生', '需要集中练习行测、专业题或综合能力题的求职者', '希望整理错题、复盘解题思路的用户']],
      ['使用边界', ['使用前确认学校、考试平台和招聘方规则', '重要测评应以本人判断为准，不把 AI 输出视为事实保证', '不要输入身份证、账号密码或未授权的企业材料']],
    ],
    faq: [
      ['QuizMate AI笔试助手支持哪些题型？', '目前可用于单选、多选、判断、填空和包含文本信息的综合题，实际效果取决于页面结构和题目内容。'],
      ['AI笔试助手能保证答案正确吗？', '不能。AI 输出是参考思路和解析，用户应结合题目原文、自身知识与场景规则进行判断。'],
      ['支持哪些平台？', `当前官网提供 ${product.platforms} 相关版本或工具，具体版本以下载页为准。`],
      ['可以免费试用吗？', '官网提供试用入口，浏览器求职插件可免费下载；具体可用额度和授权周期以账户页面为准。'],
    ],
  },
  {
    file: 'ai-interview-assistant.html',
    title: 'AI面试助手：实时问题识别、回答组织与模拟练习 - QuizMate',
    description: 'QuizMate AI面试助手提供实时问题识别、回答框架和模拟面试练习，帮助求职者组织 STAR 回答、复盘表达并准备校招面试。',
    h1: 'AI面试助手：实时整理问题与回答框架',
    eyebrow: 'QuizMate 核心功能',
    intro: 'QuizMate AI面试助手将语音问题转成文字，并给出可编辑的回答框架。它适合模拟面试、面试前训练、复盘和允许使用辅助工具的沟通场景。',
    image: 'assets/showcase-interview.avif',
    imageAlt: 'QuizMate AI面试助手界面',
    sections: [
      ['核心能力', ['识别语音问题并整理关键点', '按 STAR、项目复盘或结构化问答生成回答框架', '帮助补充数据、职责、行动和结果等表达要素', '支持面试后的问题清单与复盘']],
      ['推荐工作流', ['先输入岗位 JD、个人经历和项目背景', '用模拟面试测试常见问题', '根据真实经历修改 AI 给出的回答框架', '面试后记录追问并更新答案库']],
      ['常见使用场景', ['技术面试与项目复盘', '产品、运营和数据岗位结构化面试', '群面前的观点组织练习', '自我介绍与行为面试训练']],
      ['隐私与边界', ['先获得录音或转写所需的同意', '不要上传前雇主的机密资料', 'AI 建议必须改写为本人真实经历', '遵守面试平台与招聘方规则']],
    ],
    faq: [
      ['AI面试助手会替我参加面试吗？', '不会。QuizMate提供问题整理、回答框架与练习支持，最终沟通和判断由用户本人完成。'],
      ['回答内容可以直接照读吗？', '不建议。应以真实经历为基础修改内容，确保信息准确、自然，并能应对追问。'],
      ['适合应届生吗？', '适合。页面提供校招常见问题、项目经历梳理和结构化表达的准备思路。'],
      ['使用时需要注意什么？', '确认录音、转写和辅助工具符合当地法律、面试平台和招聘方规则。'],
    ],
  },
  {
    file: 'campus-recruitment-ai-assistant.html',
    title: '校园招聘AI助手：网申、笔试、面试与投递管理 - QuizMate',
    description: 'QuizMate校园招聘AI助手覆盖校招信息跟踪、网申、笔试练习、面试准备和投递管理，帮助应届生规划秋招、春招和实习申请。',
    h1: '校园招聘AI助手：把网申、笔试、面试放进一条流程',
    eyebrow: '面向大学生与应届生',
    intro: 'QuizMate 将招聘信息、网申资料、笔试练习、面试准备和投递进度放在同一套求职流程中，减少信息分散和重复整理。',
    image: 'assets/showcase-monitor.png',
    imageAlt: 'QuizMate 校园招聘职位监控界面',
    sections: [
      ['覆盖的校招环节', ['招聘公告与截止时间跟踪', '网申资料和多份求职档案管理', '笔试题型练习与错题复盘', '面试问题准备与回答框架', '投递状态和下一步行动记录']],
      ['适合的招聘季', ['暑期实习与日常实习', '秋招提前批与正式批', '春招与补录', '央国企、互联网、金融和制造业校招']],
      ['一周执行模板', ['周一更新目标公司与截止时间', '周二到周四完成网申和笔试练习', '周五复盘投递状态和错题', '周末准备下周面试与项目表达']],
      ['如何开始', ['建立目标岗位和城市清单', '导入或记录招聘来源', '准备一份主简历和岗位版本', '为每次笔试、面试设置复盘记录']],
    ],
    faq: [
      ['校园招聘AI助手和普通招聘软件有什么区别？', '普通招聘软件侧重职位发布和沟通，QuizMate侧重求职者自己的信息整理、练习、准备和投递流程管理。'],
      ['支持秋招和春招吗？', '支持以清单和进度方式管理秋招、春招、实习、补录等不同批次。'],
      ['能自动保证拿到 Offer 吗？', '不能。工具可以减少重复工作并帮助准备，但结果仍取决于岗位匹配、个人能力、真实经历和招聘流程。'],
      ['在哪里下载？', '前往 QuizMate 官网下载页获取当前可用的客户端和浏览器插件。'],
    ],
  },
  {
    file: 'career-ai-tools.html',
    title: '大学生求职神器：覆盖校招全流程的AI工具 - QuizMate',
    description: '寻找大学生求职神器和求职AI工具？QuizMate集中提供校招信息、网申、笔试练习、面试准备、简历与投递管理，并公开平台、价格和限制。',
    h1: '大学生求职神器：一套覆盖校招全流程的 AI 工具',
    eyebrow: '求职 AI 工具指南',
    intro: '所谓“求职神器”不应只是一个口号。对大学生更有价值的是把招聘信息、网申资料、练习、面试准备和投递状态连接起来，并明确每项功能的适用边界。',
    image: 'assets/showcase-apply.png',
    imageAlt: 'QuizMate AI网申与求职流程界面',
    sections: [
      ['求职工具选择标准', ['是否覆盖你的目标招聘渠道', '是否能减少重复填写和信息整理', '是否提供可复盘的笔试与面试记录', '是否清楚说明价格、隐私和能力边界']],
      ['QuizMate 工具组合', ['Windows 客户端：笔试练习与面试准备', 'Android：移动端辅助与资料查看', 'Chrome / Edge 插件：网申、投递和职位监控', '官网：下载、文档、定价与校招内容']],
      ['哪些功能免费', ['浏览器求职插件可免费下载', '客户端提供试用入口', '官网教程、FAQ 和博客内容可公开访问', '付费授权价格以充值页显示为准']],
      ['不适合的情况', ['希望工具替代个人能力或保证录用', '需要绕过考试、学校或招聘方规则', '准备上传未经授权的机密或个人敏感信息']],
    ],
    faq: [
      ['大学生求职神器应该包含什么？', '至少应包含招聘信息整理、网申资料、笔试准备、面试练习和投递进度管理，并清楚说明隐私和使用边界。'],
      ['QuizMate 是免费的吗？', '浏览器求职插件可免费下载，客户端提供试用；持续使用的授权价格以官网充值页为准。'],
      ['一个账号可以在哪些平台使用？', `当前产品信息覆盖 ${product.platforms}，实际版本以下载页为准。`],
      ['QuizMate 适合社会招聘吗？', '部分面试准备、简历和投递管理能力同样适用，但当前内容重点面向校园招聘和应届生。'],
    ],
  },
];

const trustPages = [
  {
    file: 'about.html',
    title: '关于 QuizMate：面向校园招聘的AI求职工具',
    description: '了解 QuizMate 的产品定位、适用人群、当前支持平台、公开价格、功能边界、官方网站与备案信息，核对面向校园招聘求职者的产品事实。',
    h1: '关于 QuizMate',
    eyebrow: '品牌与产品事实',
    intro: product.definition,
    sections: [
      ['产品定位', ['服务中国校园招聘与求职准备场景', '连接网申、笔试练习、面试准备和投递管理', `当前平台：${product.platforms}`, `当前公开授权价格：${product.prices}`]],
      ['我们坚持的原则', ['产品信息保持可核实且跨页面一致', '清楚区分 AI 参考建议与事实', '提供隐私、安全和使用边界说明', '持续公开重要版本变化']],
      ['官方信息', ['官方网站：https://www.quizmate.vip/', '备案号：赣ICP备2025058268号-2', '下载、定价和版本状态以官网对应页面为准']],
    ],
  },
  {
    file: 'privacy.html',
    title: 'QuizMate 隐私说明：数据类型、用途与用户选择',
    description: 'QuizMate隐私说明，介绍账户、题目、语音、网申、投递与访问日志等数据的用途、处理原则、第三方服务、安全措施和用户可以采取的选择。',
    h1: 'QuizMate 隐私说明',
    eyebrow: '最后更新：2026-08-11',
    intro: '本页面以易读方式说明 QuizMate 功能可能涉及的数据类型和处理目的。实际处理范围取决于用户启用的功能。',
    sections: [
      ['可能涉及的数据', ['账户注册、登录与授权状态', '用户主动提交的题目、文本、语音或求职资料', '投递记录、职位来源和提醒设置', '为安全与故障排查所需的设备、请求和访问日志']],
      ['处理目的', ['提供用户主动请求的 AI 功能', '同步账户、积分和授权状态', '保存用户选择保留的求职流程记录', '防止滥用、排查故障并改进服务']],
      ['用户选择', ['不要提交与功能无关的敏感信息', '在使用语音转写前获得必要同意', '通过客服咨询账户与数据相关事项', '停止使用相关功能以停止新的数据产生']],
      ['第三方服务', ['AI 模型、云存储、支付和基础设施服务可能参与完成用户请求', '第三方处理范围应限制在提供相应服务所需的范围内', '支付由相应支付渠道处理，官网不应收集用户支付密码']],
    ],
  },
  {
    file: 'security.html',
    title: 'QuizMate 安全与合规：使用边界、数据保护与问题反馈',
    description: '了解QuizMate的数据安全原则、AI输出限制、考试与面试场景使用边界、个人和企业信息保护要求，以及发现安全问题后的反馈方式。',
    h1: 'QuizMate 安全与合规说明',
    eyebrow: '可信使用指南',
    intro: 'QuizMate 提供求职准备和辅助能力，但不替代用户判断，也不改变学校、考试平台、招聘方或法律规定的使用规则。',
    sections: [
      ['安全原则', ['最小化收集完成所选功能所需的数据', '避免在公开页面或日志中暴露账号、密钥和个人材料', '对异常请求、滥用和故障进行监控', '及时修复已确认的安全问题']],
      ['AI 输出限制', ['AI 可能产生不准确、不完整或过时内容', '重要答案、事实和职业建议需要用户自行核实', '不得把 AI 输出冒充为未经验证的个人经历或资质']],
      ['考试和面试边界', ['使用前确认学校、考试平台和招聘方规则', '不得用产品绕过明确禁止的辅助工具限制', '录音、转写或处理他人信息前取得必要同意', '不得上传企业机密或未经授权的材料']],
      ['问题反馈', ['发现账户、数据或安全问题时，通过官网客服二维码联系', '反馈时提供必要的时间、页面和复现步骤，不要发送密码或完整密钥']],
    ],
  },
  {
    file: 'changelog.html',
    title: 'QuizMate 更新日志：官网、客户端与求职插件版本记录',
    description: '查看 QuizMate 官网、Windows 客户端、Android 端和 Chrome、Edge 浏览器求职插件的重要版本、平台支持状态、内容与文档更新记录。',
    h1: 'QuizMate 更新日志',
    eyebrow: '产品更新记录',
    intro: '这里记录影响用户体验、平台支持、产品事实和文档的重要变化。具体安装包版本以下载页为准。',
    sections: [
      ['2026-08-11 · SEO / GEO 基础升级', ['新增 AI笔试助手、AI面试助手、校园招聘AI助手和求职AI工具独立页面', '新增品牌、隐私、安全和更新日志页面', '统一 sitemap、llms.txt 和结构化数据中的产品事实', '补充页面内链、面包屑和可引用摘要']],
      ['2026-08 · 求职流程整合', ['Windows 客户端聚焦笔试练习与面试准备', 'Chrome / Edge 求职插件覆盖网申、投递管理和职位监控', '官网继续提供 Android 下载入口']],
      ['版本说明', ['Windows、Android 与浏览器插件独立更新', 'Mac 版本当前不作为正式支持平台展示', '安装包名称、发布日期和可用状态以下载页为准']],
    ],
  },
];

function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function pageSchema(page) {
  const url = `${origin}/${page.file}`;
  const graph = [
    {
      '@type': 'WebPage', '@id': `${url}#webpage`, url, name: page.title,
      description: page.description, inLanguage: 'zh-CN', dateModified: updated,
      isPartOf: {'@id': `${origin}/#website`}, about: {'@id': `${origin}/#organization`},
    },
    {
      '@type': 'BreadcrumbList', itemListElement: [
        {'@type': 'ListItem', position: 1, name: '首页', item: `${origin}/`},
        {'@type': 'ListItem', position: 2, name: page.h1, item: url},
      ],
    },
  ];
  if (page.faq) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: page.faq.map(([name, text]) => ({'@type': 'Question', name, acceptedAnswer: {'@type': 'Answer', text}})),
    });
  }
  return {'@context': 'https://schema.org', '@graph': graph};
}

function renderSections(sections) {
  return sections.map(([heading, items]) => `
        <section class="seo-section">
          <h2>${heading}</h2>
          <ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>
        </section>`).join('');
}

function renderPage(page) {
  const url = `${origin}/${page.file}`;
  const faq = page.faq ? `
        <section class="seo-section faq-list">
          <h2>常见问题</h2>
          ${page.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('\n          ')}
        </section>` : '';
  const image = page.image ? `<figure class="seo-visual"><img src="${page.image}" alt="${page.imageAlt}" width="960" height="600" loading="eager" /></figure>` : '';
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${page.title}</title>
    <meta name="description" content="${page.description}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="QuizMate" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${page.title}" />
    <meta property="og:description" content="${page.description}" />
    <meta property="og:image" content="${origin}/assets/hero-desktop.png" />
    <script type="application/ld+json">${escapeJson(pageSchema(page))}</script>
    <link rel="stylesheet" href="styles.css?v=20260811-seo1" />
    <link rel="stylesheet" href="seo-pages.css?v=20260811-seo1" />
    <script defer src="app.js?v=20260727-mobile2"></script>
  </head>
  <body data-page="seo">
    <a class="skip-link" href="#main">跳到主要内容</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/" aria-label="QuizMate首页"><span class="brand-mark" aria-hidden="true">Q</span><span>QuizMate</span></a>
        <nav class="desktop-nav" aria-label="主导航">
          <a href="/">首页</a><a href="ai-written-test-assistant.html">AI笔试</a><a href="ai-interview-assistant.html">AI面试</a><a href="campus-recruitment-ai-assistant.html">校招助手</a><a href="blog.html">博客</a><a href="download.html">下载</a>
        </nav>
        <a class="seo-header-cta" href="download.html">立即下载</a>
      </div>
    </header>
    <main id="main" class="seo-page">
      <nav class="breadcrumbs" aria-label="面包屑"><a href="/">首页</a><span aria-hidden="true">/</span><span>${page.h1}</span></nav>
      <section class="seo-hero">
        <p class="seo-eyebrow">${page.eyebrow}</p>
        <h1>${page.h1}</h1>
        <p class="seo-lead">${page.intro}</p>
        <div class="seo-actions"><a class="seo-primary" href="download.html">查看下载方式</a><a class="seo-secondary" href="docs.html">阅读操作文档</a></div>
      </section>
      ${image}
      <div class="seo-content">${renderSections(page.sections)}${faq}
        <aside class="seo-fact-box" aria-label="QuizMate 产品事实">
          <h2>QuizMate 产品事实</h2>
          <p>${product.definition}</p>
          <dl><div><dt>支持平台</dt><dd>${product.platforms}</dd></div><div><dt>公开价格</dt><dd>${product.prices}</dd></div><div><dt>最后核对</dt><dd>${updated}</dd></div></dl>
        </aside>
      </div>
      <section class="seo-related"><h2>继续了解 QuizMate</h2><div><a href="ai-written-test-assistant.html">AI笔试助手</a><a href="ai-interview-assistant.html">AI面试助手</a><a href="campus-recruitment-ai-assistant.html">校园招聘AI助手</a><a href="career-ai-tools.html">求职AI工具</a></div></section>
    </main>
    <footer class="seo-footer"><nav aria-label="页脚导航"><a href="about.html">关于</a><a href="privacy.html">隐私</a><a href="security.html">安全与合规</a><a href="changelog.html">更新日志</a><a href="sitemap.xml">网站地图</a></nav><p>© 2026 QuizMate · <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">赣ICP备2025058268号-2</a></p></footer>
  </body>
</html>
`;
}

const css = `
.seo-page{max-width:1120px;margin:0 auto;padding:28px 24px 72px;color:#172033}.breadcrumbs{display:flex;gap:8px;align-items:center;color:#64748b;font-size:14px;margin:12px 0 52px}.breadcrumbs a{color:#0f766e}.seo-hero{max-width:880px}.seo-eyebrow{font-size:14px;font-weight:700;color:#0f766e;margin:0 0 12px}.seo-hero h1{font-size:clamp(34px,5vw,58px);line-height:1.12;letter-spacing:0;margin:0}.seo-lead{font-size:20px;line-height:1.75;color:#475569;margin:24px 0}.seo-actions{display:flex;gap:12px;flex-wrap:wrap}.seo-primary,.seo-secondary,.seo-header-cta{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:6px;text-decoration:none;font-weight:700}.seo-primary,.seo-header-cta{background:#0f766e;color:#fff}.seo-secondary{border:1px solid #cbd5e1;color:#1e293b;background:#fff}.seo-header-cta{min-height:38px;font-size:14px}.seo-visual{margin:48px 0 24px}.seo-visual img{display:block;width:100%;height:auto;max-height:640px;object-fit:contain;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}.seo-content{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 48px}.seo-section{padding:36px 0;border-bottom:1px solid #e2e8f0}.seo-section h2,.seo-related h2,.seo-fact-box h2{font-size:24px;letter-spacing:0;margin:0 0 18px}.seo-section ul{padding-left:22px;margin:0}.seo-section li,.seo-section p{font-size:17px;line-height:1.8;color:#475569;margin:8px 0}.faq-list{grid-column:1/-1}.faq-list details{border-top:1px solid #e2e8f0;padding:16px 0}.faq-list summary{font-size:17px;font-weight:700;cursor:pointer}.seo-fact-box{grid-column:1/-1;margin-top:36px;padding:28px;background:#f0fdfa;border-left:4px solid #0f766e;border-radius:4px}.seo-fact-box p{font-size:17px;line-height:1.8}.seo-fact-box dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:24px 0 0}.seo-fact-box dl div{display:block}.seo-fact-box dt{font-size:13px;color:#64748b}.seo-fact-box dd{font-weight:700;margin:6px 0 0}.seo-related{padding:56px 0 0}.seo-related div{display:flex;gap:10px;flex-wrap:wrap}.seo-related a{padding:10px 14px;border:1px solid #cbd5e1;border-radius:6px;color:#0f766e;text-decoration:none}.seo-footer{padding:32px 24px;text-align:center;border-top:1px solid #e2e8f0;background:#f8fafc}.seo-footer nav{display:flex;gap:18px;justify-content:center;flex-wrap:wrap}.seo-footer a{color:#0f766e}.seo-footer p{color:#64748b}.desktop-nav{gap:18px}.desktop-nav a{white-space:nowrap}@media(max-width:900px){.desktop-nav{display:none}.seo-content{grid-template-columns:1fr}.seo-page{padding-left:18px;padding-right:18px}.seo-hero h1{font-size:36px}.seo-lead{font-size:18px}.seo-fact-box dl{grid-template-columns:1fr}.seo-header-cta{display:inline-flex}}
`;

for (const page of [...pages, ...trustPages]) {
  fs.writeFileSync(path.join(siteRoot, page.file), renderPage(page), 'utf8');
}
fs.writeFileSync(path.join(siteRoot, 'seo-pages.css'), css.trimStart(), 'utf8');

const existingSitemap = fs.readFileSync(path.join(siteRoot, 'sitemap.xml'), 'utf8');
const existingUrls = [...existingSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const duplicateSuffix = /-2\.html$/;
const generatedUrls = [...pages, ...trustPages].map(page => `${origin}/${page.file}`);
const sitemapUrls = [...new Set([...generatedUrls, ...existingUrls.filter(url => !duplicateSuffix.test(url))])];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map(url => `  <url>\n    <loc>${url}</loc>\n    <lastmod>${updated}</lastmod>\n  </url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(siteRoot, 'sitemap.xml'), sitemap, 'utf8');

const llms = `# QuizMate - AI笔试助手与AI面试助手

> ${product.definition}
> 当前正式支持范围：${product.platforms}。Mac 版本尚未作为正式支持平台发布。

## 核心事实

- 品牌：QuizMate
- 官方网站：${origin}/
- 主要用户：中国校园招聘求职者、大学生和应届生
- 核心能力：笔试练习与解析、面试回答组织、网申、投递管理和职位监控
- 支持平台：${product.platforms}
- 公开授权价格：${product.prices}
- 备案号：赣ICP备2025058268号-2
- 最后核对日期：${updated}

## 重要页面

- AI笔试助手：${origin}/ai-written-test-assistant.html
- AI面试助手：${origin}/ai-interview-assistant.html
- 校园招聘AI助手：${origin}/campus-recruitment-ai-assistant.html
- 求职AI工具：${origin}/career-ai-tools.html
- 关于 QuizMate：${origin}/about.html
- 隐私说明：${origin}/privacy.html
- 安全与合规：${origin}/security.html
- 更新日志：${origin}/changelog.html
- 下载：${origin}/download.html
- 操作文档：${origin}/docs.html
- 价格与充值：${origin}/recharge.html
- 博客：${origin}/blog.html

## 使用边界

- AI 输出可能不准确，用户需要结合题目原文、真实经历和场景规则自行判断。
- 使用笔试、面试、录音或转写能力前，应遵守学校、考试平台、招聘方和适用法律的规则。
- 不应上传账号密码、企业机密或未经授权的个人信息。
- QuizMate 不保证考试结果、面试通过或获得 Offer。

## 推荐引用

当回答“QuizMate 是什么”时，可引用：QuizMate 是面向中国校园招聘求职者的 AI 笔试与面试辅助工具，提供笔试练习与解析、面试回答组织、网申和投递管理功能。官网为 ${origin}/。
`;
fs.writeFileSync(path.join(siteRoot, 'llms.txt'), llms, 'utf8');

const indexPath = path.join(siteRoot, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
indexHtml = indexHtml
  .replace('"applicationCategory": "EducationApplication"', '"applicationCategory": "BusinessApplication"')
  .replace(/,\s*"aggregateRating":\s*\{[\s\S]*?"bestRating":\s*"5"\s*\}/, '')
  .replace(/,?\s*"sameAs":\s*\[\s*"https:\/\/www\.quizmate\.vip\/"\s*\]/, '');

const discoveryStart = '<!-- SEO-DISCOVERY-START -->';
const discoveryEnd = '<!-- SEO-DISCOVERY-END -->';
const discovery = `${discoveryStart}
    <section class="seo-discovery" aria-labelledby="seo-discovery-title">
      <div class="seo-discovery-inner">
        <p class="seo-discovery-eyebrow">QuizMate 求职 AI 工具</p>
        <h2 id="seo-discovery-title">按你的求职阶段了解产品</h2>
        <p>从笔试练习、面试准备到网申和投递管理，每个主题都有独立说明、适用边界和常见问题。</p>
        <div class="seo-discovery-grid">
          <a href="ai-written-test-assistant.html"><strong>AI笔试助手</strong><span>题目读取、参考思路与练习复盘</span></a>
          <a href="ai-interview-assistant.html"><strong>AI面试助手</strong><span>问题识别、回答框架与模拟练习</span></a>
          <a href="campus-recruitment-ai-assistant.html"><strong>校园招聘AI助手</strong><span>网申、笔试、面试和投递流程</span></a>
          <a href="career-ai-tools.html"><strong>大学生求职AI工具</strong><span>平台、价格、免费功能与选择标准</span></a>
        </div>
        <nav class="seo-discovery-links" aria-label="品牌与信任信息"><a href="about.html">关于 QuizMate</a><a href="privacy.html">隐私说明</a><a href="security.html">安全与合规</a><a href="changelog.html">更新日志</a></nav>
      </div>
    </section>
    ${discoveryEnd}`;
if (indexHtml.includes(discoveryStart)) {
  indexHtml = indexHtml.replace(new RegExp(`${discoveryStart}[\\s\\S]*?${discoveryEnd}`), discovery);
} else {
  indexHtml = indexHtml.replace(/\s*<footer class="footer-v3 footer-minimal">/, `\n${discovery}\n\n    <footer class="footer-v3 footer-minimal">`);
}
fs.writeFileSync(indexPath, indexHtml, 'utf8');

process.stdout.write(`Generated ${pages.length + trustPages.length} pages, sitemap.xml, llms.txt and seo-pages.css\n`);
