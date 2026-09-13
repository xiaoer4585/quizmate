export const PROFILE_STORAGE_KEY = 'qmaiProfiles';
export const ACTIVE_PROFILE_KEY = 'qmaiCurrentProfileId';
export const SETTINGS_KEY = 'qmaiPersonalSettings';

export const DEFAULT_SETTINGS = Object.freeze({
  useVision: false,
  fillOnlyEmpty: true,
  fillDelayMs: 55,
  maxRounds: 3
});

export const GROUP_FIELDS = Object.freeze({
  basic: [
    ['name', '姓名'], ['englishName', '英文名'], ['gender', '性别'], ['birthday', '出生日期'], ['age', '年龄'],
    ['phone', '手机号'], ['email', '邮箱'], ['idType', '证件类型'], ['idNumber', '证件号码'], ['nationality', '国籍'],
    ['ethnicity', '民族'], ['nativePlace', '籍贯'], ['currentCity', '现居城市'], ['householdRegistration', '户籍所在地'],
    ['gaokaoOrigin', '高考生源地'], ['address', '联系地址'], ['postalCode', '邮编'], ['height', '身高'], ['weight', '体重'],
    ['politicalStatus', '政治面貌'], ['maritalStatus', '婚姻状况'], ['healthStatus', '健康状况'], ['isFreshGraduate', '是否应届'],
    ['wechat', '微信号'], ['emergencyContact', '紧急联系人'], ['emergencyPhone', '紧急联系人电话'],
    ['highestEducation', '最高学历'], ['personalWebsite', '个人主页/作品集'], ['github', 'GitHub'], ['linkedin', 'LinkedIn']
  ],
  skills: [
    ['languages', '语言能力', 'textarea'], ['englishLevel', '英语等级'], ['englishScore', '英语成绩'], ['otherLanguages', '其他语言'],
    ['computerLevel', '计算机水平'], ['certificates', '证书', 'textarea'], ['technical', '专业技能', 'textarea'], ['hobbies', '兴趣爱好', 'textarea']
  ],
  intention: [
    ['position', '意向岗位'], ['industry', '意向行业'], ['cities', '意向城市'], ['salary', '期望薪资'], ['arrivalDate', '到岗时间'],
    ['employmentType', '工作性质'], ['internshipDuration', '实习时长'], ['weeklyDays', '每周到岗天数'],
    ['acceptAdjustment', '接受调剂'], ['acceptAssignment', '服从分配'], ['sourceChannel', '信息获取渠道']
  ],
  evaluation: [
    ['summary', '自我评价', 'textarea'], ['strengths', '个人优势', 'textarea'], ['reason', '应聘理由', 'textarea'], ['careerPlan', '职业规划', 'textarea']
  ]
});

export const ARRAY_SECTIONS = Object.freeze({
  educations: {
    label: '教育经历',
    fields: [['level', '学历层次'], ['school', '学校'], ['college', '学院'], ['major', '专业'], ['degree', '学位'], ['startDate', '开始时间'], ['endDate', '毕业时间'], ['gpa', 'GPA'], ['ranking', '排名'], ['city', '学校城市'], ['courses', '主修课程', 'textarea'], ['educationMode', '学习形式']]
  },
  internships: {
    label: '实习经历',
    fields: [['company', '公司'], ['position', '岗位'], ['department', '部门'], ['startDate', '开始时间'], ['endDate', '结束时间'], ['type', '形式'], ['level', '岗位级别'], ['description', '职责描述', 'textarea'], ['achievements', '成果', 'textarea'], ['technologies', '技术栈', 'textarea']]
  },
  works: {
    label: '工作经历',
    fields: [['company', '公司'], ['position', '岗位'], ['department', '部门'], ['startDate', '开始时间'], ['endDate', '结束时间'], ['description', '职责描述', 'textarea'], ['achievements', '成果', 'textarea']]
  },
  projects: {
    label: '项目经历',
    fields: [['name', '项目名称'], ['role', '角色'], ['startDate', '开始时间'], ['endDate', '结束时间'], ['url', '项目链接'], ['description', '项目描述', 'textarea'], ['achievements', '项目成果', 'textarea'], ['technologies', '技术栈', 'textarea']]
  },
  campus: {
    label: '校园经历',
    fields: [['org', '组织/社团'], ['role', '职务'], ['startDate', '开始时间'], ['endDate', '结束时间'], ['description', '经历描述', 'textarea'], ['achievements', '成果', 'textarea']]
  },
  family: {
    label: '家庭成员',
    fields: [['relation', '关系'], ['name', '姓名'], ['company', '工作单位'], ['position', '职务'], ['isBankStaff', '是否银行员工'], ['phone', '联系电话']]
  },
  awards: {
    label: '荣誉奖励',
    fields: [['name', '奖项名称'], ['level', '级别'], ['date', '获奖时间'], ['description', '说明', 'textarea']]
  },
  trainings: {
    label: '培训经历',
    fields: [['name', '培训名称'], ['org', '培训机构'], ['startDate', '开始时间'], ['endDate', '结束时间'], ['description', '培训内容', 'textarea'], ['result', '培训成果', 'textarea']]
  }
});

export function emptyProfile() {
  const groups = Object.fromEntries(Object.entries(GROUP_FIELDS).map(([group, fields]) => [
    group,
    Object.fromEntries(fields.map(([key]) => [key, '']))
  ]));
  return {
    ...groups,
    ...Object.fromEntries(Object.keys(ARRAY_SECTIONS).map((key) => [key, []])),
    customFields: []
  };
}

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => value == null ? '' : String(value);

export function normalizeProfile(value) {
  const source = object(value);
  const base = emptyProfile();
  for (const [group, fields] of Object.entries(GROUP_FIELDS)) {
    const input = object(source[group]);
    for (const [key] of fields) base[group][key] = text(input[key]);
  }
  for (const [section, config] of Object.entries(ARRAY_SECTIONS)) {
    const rows = Array.isArray(source[section]) ? source[section] : [];
    base[section] = rows.slice(0, 100).map((row) => {
      const input = object(row);
      return Object.fromEntries(config.fields.map(([key]) => [key, text(input[key])]));
    });
  }
  base.customFields = (Array.isArray(source.customFields) ? source.customFields : []).slice(0, 200).map((item) => ({
    label: text(item?.label), value: text(item?.value)
  })).filter((item) => item.label || item.value);
  return base;
}

export function createProfileRecord(name = '我的简历') {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), name, profile: emptyProfile(), sourceFileName: '', createdAt: now, updatedAt: now };
}

export function createExampleProfileRecord() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: '示例简历（可直接测试）',
    sourceFileName: 'QuizMate 内置虚构示例',
    createdAt: now,
    updatedAt: now,
    profile: normalizeProfile({
      basic: {
        name: '李明', englishName: 'Ming Li', gender: '男', birthday: '2002-06-15', age: '24',
        phone: '13800000000', email: 'demo.resume@quizmate.cn', idType: '居民身份证', idNumber: '110101200206150018',
        nationality: '中国', ethnicity: '汉族', nativePlace: '江苏南京', currentCity: '上海', householdRegistration: '江苏省南京市',
        gaokaoOrigin: '江苏省南京市', address: '上海市浦东新区示例路 88 号', postalCode: '200120', height: '178cm', weight: '68kg',
        politicalStatus: '共青团员', maritalStatus: '未婚', healthStatus: '良好', isFreshGraduate: '是', wechat: 'quizmate_demo',
        emergencyContact: '李华', emergencyPhone: '13900000000', highestEducation: '硕士研究生', personalWebsite: 'https://www.quizmate.cn/',
        github: 'https://github.com/example', linkedin: 'https://www.linkedin.com/in/example'
      },
      intention: {
        position: 'AI 产品经理 / 数据产品经理', industry: '互联网 / 人工智能', cities: '上海、杭州、深圳', salary: '面议',
        arrivalDate: '2026-07-01', employmentType: '全职', internshipDuration: '6 个月', weeklyDays: '5 天',
        acceptAdjustment: '是', acceptAssignment: '是', sourceChannel: 'QuizMate 官网'
      },
      skills: {
        languages: '普通话（母语）、英语（熟练）', englishLevel: 'CET-6', englishScore: '568', otherLanguages: '日语 N3',
        computerLevel: '全国计算机二级', certificates: 'PMP、CET-6、计算机二级',
        technical: 'Axure、Figma、SQL、Python、Tableau；熟悉需求分析、A/B 测试和大模型应用设计',
        hobbies: '羽毛球、摄影、开源项目'
      },
      evaluation: {
        summary: '具备 AI 产品、数据分析与跨团队协作经验，能够从用户问题出发完成需求拆解、原型设计、上线验证和复盘。',
        strengths: '学习和结构化表达能力强；熟悉大模型产品落地；对数据变化敏感，执行推进稳定。',
        reason: '希望参与真实用户规模下的 AI 产品建设，将技术能力转化为可靠、易用的产品体验。',
        careerPlan: '三年内成长为能够独立负责复杂业务模块的 AI 产品经理，并持续积累行业和技术判断。'
      },
      educations: [
        { level: '硕士研究生', school: '华东示例大学', college: '计算机学院', major: '人工智能', degree: '工学硕士', startDate: '2024-09', endDate: '2027-06', gpa: '3.82/4.00', ranking: '前 10%', city: '上海', courses: '机器学习、自然语言处理、数据挖掘、产品设计', educationMode: '全日制' },
        { level: '本科', school: '江南示例大学', college: '管理学院', major: '信息管理与信息系统', degree: '管理学学士', startDate: '2020-09', endDate: '2024-06', gpa: '3.65/4.00', ranking: '前 15%', city: '南京', courses: '数据库、统计学、用户研究、项目管理', educationMode: '全日制' }
      ],
      internships: [
        { company: '星河科技有限公司（示例）', position: 'AI 产品实习生', department: '智能产品部', startDate: '2025-07', endDate: '2025-12', type: '实习', level: '实习生', description: '负责智能客服知识库与评测平台需求分析，协同算法、研发和运营推进迭代。', achievements: '核心问答命中率提升 18%，人工转接率下降 12%。', technologies: 'LLM、RAG、SQL、Figma' }
      ],
      works: [
        { company: '远景数据有限公司（示例）', position: '产品助理', department: '数据产品部', startDate: '2024-01', endDate: '2024-06', description: '参与经营分析看板规划、需求评审、验收和用户培训。', achievements: '将周报整理时间从 4 小时缩短至 40 分钟。' }
      ],
      projects: [
        { name: '智能求职助手', role: '项目负责人', startDate: '2025-02', endDate: '2025-06', url: 'https://www.quizmate.cn/', description: '面向校招用户设计简历结构化与网申自动填写原型。', achievements: '完成 30 位用户访谈和 3 轮可用性测试，关键任务完成率达到 92%。', technologies: 'Figma、Python、PostgreSQL、LLM' }
      ],
      campus: [
        { org: '研究生会创新实践部', role: '项目负责人', startDate: '2024-09', endDate: '2025-06', description: '策划校园 AI 产品挑战赛并协调导师、企业和学生团队。', achievements: '覆盖 18 支团队、300 余名参与者。' }
      ],
      family: [
        { relation: '父亲', name: '李建国', company: '某制造企业', position: '工程师', isBankStaff: '否', phone: '13700000000' },
        { relation: '母亲', name: '王芳', company: '某事业单位', position: '职员', isBankStaff: '否', phone: '13600000000' }
      ],
      awards: [
        { name: '全国大学生创新创业竞赛省级一等奖（示例）', level: '省级一等奖', date: '2025-05', description: '负责产品方案、用户研究与答辩。' },
        { name: '校级优秀学生奖学金', level: '校级一等奖', date: '2024-11', description: '综合成绩与实践表现优秀。' }
      ],
      trainings: [
        { name: 'AI 产品经理实战训练营', org: 'QuizMate 学习中心（示例）', startDate: '2025-01', endDate: '2025-03', description: '完成需求分析、模型评测、RAG 产品和数据闭环课程。', result: '优秀学员证书' }
      ],
      customFields: [
        { label: '是否接受出差', value: '是，可接受每月 5 天以内出差' },
        { label: '期望工作地点优先级', value: '上海 > 杭州 > 深圳' },
        { label: '个人亮点', value: '兼具技术理解、产品设计和数据分析能力' }
      ]
    })
  };
}

const nonEmpty = (entries) => Object.fromEntries(entries.filter(([, value]) => value !== '' && value != null));

function educationValues(row = {}) {
  return nonEmpty([
    ['school', row.school], ['educationCollege', row.college], ['faculty', row.college], ['major', row.major],
    ['degree', row.level || row.degree], ['educationDegree', row.degree], ['educationForm', row.educationMode],
    ['educationCourses', row.courses], ['educationRank', row.ranking], ['gpa', row.gpa],
    ['educationStartDate', row.startDate], ['educationEndDate', row.endDate], ['graduationDate', row.endDate]
  ]);
}

function experienceValues(row = {}, kind = '') {
  return nonEmpty([
    ['experienceOrganization', row.company], ['experienceTitle', row.position], ['experienceDepartment', row.department],
    ['experienceStartDate', row.startDate], ['experienceEndDate', row.endDate], ['experienceType', row.type || kind],
    ['experienceDescription', row.description], ['experienceAchievements', row.achievements]
  ]);
}

function projectValues(row = {}) {
  return nonEmpty([
    ['projectName', row.name], ['projectRole', row.role], ['projectStartDate', row.startDate], ['projectEndDate', row.endDate],
    ['projectDescription', row.description], ['projectAchievement', row.achievements], ['projectLink', row.url]
  ]);
}

function campusValues(row = {}) {
  return nonEmpty([
    ['campusExperienceType', row.org], ['campusExperienceRole', row.role], ['campusExperienceStartDate', row.startDate],
    ['campusExperienceEndDate', row.endDate], ['campusExperienceDescription', row.description || row.achievements]
  ]);
}

function awardValues(row = {}) {
  return nonEmpty([['awardName', row.name], ['awardLevel', row.level], ['awardDate', row.date], ['awardDescription', row.description]]);
}

function familyValues(row = {}) {
  return nonEmpty([['familyRelation', row.relation], ['familyName', row.name], ['familyCompany', row.company], ['familyPosition', row.position], ['familyPhone', row.phone]]);
}

export function toOfferFlowProfile(rawProfile) {
  const profile = normalizeProfile(rawProfile);
  const b = profile.basic;
  const s = profile.skills;
  const i = profile.intention;
  const e = profile.evaluation;
  const firstEducation = educationValues(profile.educations[0]);
  const combinedExperiences = [
    ...profile.internships.map((row) => ({ row, kind: '实习' })),
    ...profile.works.map((row) => ({ row, kind: '工作' }))
  ];
  const firstExperience = combinedExperiences[0] ? experienceValues(combinedExperiences[0].row, combinedExperiences[0].kind) : {};
  const firstProject = projectValues(profile.projects[0]);
  const firstCampus = campusValues(profile.campus[0]);
  const firstAward = awardValues(profile.awards[0]);
  const firstFamily = familyValues(profile.family[0]);
  const custom = Object.fromEntries(profile.customFields.filter((row) => row.label).map((row) => [row.label, row.value]));
  const values = nonEmpty([
    ['fullName', b.name], ['englishName', b.englishName], ['gender', b.gender], ['phone', b.phone], ['email', b.email],
    ['birthDate', b.birthday], ['currentCity', b.currentCity], ['nativePlace', b.nativePlace], ['address', b.address],
    ['height', b.height], ['weight', b.weight], ['graduateStatus', b.isFreshGraduate],
    ['nationality', b.ethnicity || b.nationality], ['countryRegion', b.nationality], ['idType', b.idType], ['idNumber', b.idNumber],
    ['wechat', b.wechat], ['politicalStatus', b.politicalStatus], ['maritalStatus', b.maritalStatus], ['healthStatus', b.healthStatus],
    ['emergencyContactName', b.emergencyContact], ['emergencyContactPhone', b.emergencyPhone],
    ['targetRole', i.position], ['targetCities', i.cities], ['earliestStartDate', i.arrivalDate], ['expectedSalary', i.salary],
    ['portfolioUrl', b.personalWebsite], ['githubUrl', b.github], ['selfIntroduction', e.summary], ['strengths', e.strengths],
    ['careerPlan', e.careerPlan], ['englishLevel', s.englishLevel], ['languageScore', s.englishScore],
    ['languageName', s.languages || s.otherLanguages], ['computerSkillType', s.technical], ['qualificationName', s.certificates],
    ['hobbies', s.hobbies]
  ]);
  const basics = { ...values, ...custom };
  Object.assign(values, firstEducation, firstExperience, firstProject, firstCampus, firstAward, firstFamily, custom);

  const max = Math.max(1, profile.educations.length, combinedExperiences.length, profile.projects.length, profile.campus.length, profile.awards.length, profile.family.length);
  const snapshots = Array.from({ length: max }, (_, index) => ({
    ...basics,
    ...educationValues(profile.educations[index]),
    ...(combinedExperiences[index] ? experienceValues(combinedExperiences[index].row, combinedExperiences[index].kind) : {}),
    ...projectValues(profile.projects[index]),
    ...campusValues(profile.campus[index]),
    ...awardValues(profile.awards[index]),
    ...familyValues(profile.family[index])
  }));
  return {
    values,
    snapshots,
    repeatCounts: {
      education: profile.educations.length,
      experience: combinedExperiences.length,
      project: profile.projects.length,
      campus: profile.campus.length,
      award: profile.awards.length,
      family: profile.family.length
    },
    repeatPlan: {
      experience: {
        internshipIndexes: profile.internships.map((_, index) => index),
        workIndexes: profile.works.map((_, index) => profile.internships.length + index)
      }
    }
  };
}

export function valueAtPath(source, path) {
  if (!path) return '';
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current = source;
  for (const part of parts) current = current?.[part];
  return current == null || typeof current === 'object' ? '' : String(current);
}
