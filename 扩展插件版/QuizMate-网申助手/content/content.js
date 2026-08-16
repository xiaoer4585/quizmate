(() => {
  if (globalThis.__QUIZMATE_AUTOFILL_LOADED__) return;
  globalThis.__QUIZMATE_AUTOFILL_LOADED__ = true;

  const FIELD_SELECTOR = [
    'input:not([type="hidden"]):not([type="password"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
    'textarea', 'select', '[contenteditable="true"]', '[role="textbox"]', '[role="combobox"]',
    '[role="radio"]', '[role="checkbox"]', '.ant-select', '.ant-cascader', '.ant-picker',
    '.el-select', '.el-cascader', '.el-date-editor', '.ivu-select', '.arco-select', '.semi-select'
  ].join(',');

  const CUSTOM_SELECT_SELECTOR = [
    '.ant-select', '.ant-cascader', '.el-select', '.el-cascader', '.ivu-select',
    '.arco-select', '.semi-select', '[role="combobox"]', '[aria-haspopup="listbox"]'
  ].join(',');

  const OPTION_SELECTOR = [
    '[role="option"]', '.ant-select-item-option', '.ant-cascader-menu-item', '.ant-cascader-menu-item-content',
    '.el-select-dropdown__item', '.el-cascader-node', '.ivu-select-item', '.arco-select-option',
    '.semi-select-option', '.dropdown-item', 'li[data-value]'
  ].join(',');

  const ALIASES = {
    '姓名': ['姓名', '真实姓名', '中文名', 'name', 'full name', 'real name'],
    '英文名': ['英文名', 'english name'],
    '性别': ['性别', 'gender', 'sex'],
    '出生年月': ['出生年月', '出生日期', '生日', 'birth', 'birthday', 'date of birth'],
    '籍贯': ['籍贯', 'native place'],
    '现居住地': ['现居住地', '当前城市', '居住城市', 'current city', 'residence'],
    '户口所在地': ['户口所在地', '户籍所在地', '户口地址', 'hukou'],
    '户口性质': ['户口性质', '户籍性质'],
    '政治面貌': ['政治面貌', 'political status'],
    '民族': ['民族', 'ethnicity', 'nation'],
    '身份证号': ['身份证号', '身份证号码', '证件号码', 'id number', 'identity number'],
    '婚姻状况': ['婚姻状况', '婚姻', 'marital status'],
    '健康状况': ['健康状况', '身体状况', 'health'],
    '身高': ['身高', 'height'], '体重': ['体重', 'weight'], '是否应届生': ['是否应届生', '应届生', 'fresh graduate'],
    '手机号': ['手机号', '手机号码', '联系电话', '移动电话', 'phone', 'mobile', 'tel'],
    '邮箱': ['邮箱', '电子邮箱', '电子邮件', 'email', 'e-mail'],
    '微信号': ['微信号', '微信', 'wechat'],
    '通讯地址': ['通讯地址', '联系地址', '详细地址', 'address'],
    '邮政编码': ['邮政编码', '邮编', 'postal code', 'zip code'],
    '紧急联系人': ['紧急联系人', 'emergency contact'],
    '紧急联系电话': ['紧急联系电话', '紧急联系人电话', 'emergency phone'],
    '个人主页': ['个人主页', '个人网站', 'portfolio', 'website'], 'GitHub': ['github'], 'LinkedIn': ['linkedin'],
    '毕业院校': ['毕业院校', '学校名称', '就读学校', '院校', '学校', 'university', 'college', 'school'],
    '学校所在城市': ['学校所在城市', '院校所在地', 'school city'],
    '院系': ['院系', '学院', 'department', 'faculty'],
    '专业': ['专业名称', '所学专业', '专业', 'major', 'field of study'],
    '学历': ['最高学历', '学历', 'education', 'degree level'],
    '专业类别': ['专业类别', '专业大类', 'major category'],
    '学位': ['学位', 'degree'],
    '入学时间': ['入学时间', '入学日期', '开始时间', 'start date'],
    '毕业时间': ['毕业时间', '毕业日期', '结束时间', 'end date', 'graduation'],
    'GPA': ['gpa', '平均绩点', '绩点'],
    'GPA满分': ['gpa满分', '绩点满分', 'gpa scale'],
    '年级排名': ['年级排名', '专业排名', '排名', 'rank'],
    '专业人数': ['专业人数', '年级人数', 'total students'],
    '培养方式': ['培养方式', '学习形式', 'education type'],
    '学制': ['学制', 'program length'], '主修课程': ['主修课程', '核心课程', 'courses'],
    '英语等级': ['英语等级', '英语水平', 'cet', 'ielts', 'toefl', 'english level'],
    '英语分数': ['英语分数', '英语成绩', 'english score'],
    '其他语言': ['其他语言', '外语能力', 'language'],
    '技能证书': ['技能证书', '证书', '专业技能', 'skills', 'certificate'],
    '实习经历': ['实习经历', '实习经验', 'internship'],
    '工作经历': ['工作经历', '工作经验', 'employment', 'work experience'],
    '项目经历': ['项目经历', '项目经验', 'project experience'],
    '校园经历': ['校园经历', '学生工作', 'campus experience'],
    '获奖情况': ['获奖情况', '荣誉奖励', '奖项', 'awards', 'honors'],
    '论文专利': ['论文专利', '论文', '专利', 'publication', 'patent'],
    '作品链接': ['作品链接', '作品集', 'portfolio url'], '家庭成员': ['家庭成员', '家庭情况', 'family members'],
    '意向岗位': ['意向岗位', '应聘职位', '申请职位', '期望职位', 'position', 'job title'],
    '意向行业': ['意向行业', '期望行业', 'industry'], '职位类别': ['职位类别', '岗位类别', 'job category'], '工作性质': ['工作性质', '全职兼职', 'employment type'],
    '意向城市': ['意向城市', '工作地点', '期望城市', 'location', 'preferred city'],
    '期望薪资': ['期望薪资', '期望月薪', '薪资要求', 'salary'],
    '到岗时间': ['到岗时间', '可入职时间', 'available date'],
    '可实习时长': ['可实习时长', '实习时长', 'internship duration'], '每周到岗天数': ['每周到岗天数', '每周实习天数', 'days per week'],
    '是否接受调剂': ['是否接受调剂', '接受调剂'],
    '是否服从分配': ['是否服从分配', '服从分配'],
    '是否有亲属任职': ['是否有亲属任职', '亲属任职'],
    '自我评价': ['自我评价', '个人评价', 'self evaluation', 'summary'],
    '个人优势': ['个人优势', '个人亮点', '优势', 'strengths'],
    '兴趣爱好': ['兴趣爱好', '爱好', 'hobbies']
  };

  const filledValues = new WeakMap();
  let autoTimer = null;
  let observer = null;

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/[\s\u00a0:：*＊()（）_\-\/\\.,，。;；]/g, '');
  }

  function textOf(element) {
    return String(element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function roots() {
    const result = [document];
    for (let index = 0; index < result.length; index++) {
      const root = result[index];
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot && !result.includes(element.shadowRoot)) result.push(element.shadowRoot);
      }
    }
    return result;
  }

  function queryAllDeep(selector) {
    const result = [];
    for (const root of roots()) {
      try { result.push(...root.querySelectorAll(selector)); } catch {}
    }
    return [...new Set(result)];
  }

  function findDeepById(id) {
    for (const root of roots()) {
      const found = root.querySelector(`[data-quizmate-field="${CSS.escape(id)}"]`);
      if (found) return found;
    }
    return null;
  }

  function isVisible(element) {
    if (!(element instanceof Element) || element.closest('[aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function getLabel(element) {
    const labels = [];
    const root = element.getRootNode();
    if (element.id) {
      try { labels.push(textOf(root.querySelector(`label[for="${CSS.escape(element.id)}"]`))); } catch {}
      try { labels.push(textOf(document.querySelector(`label[for="${CSS.escape(element.id)}"]`))); } catch {}
    }
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) for (const id of labelledBy.split(/\s+/)) labels.push(textOf(document.getElementById(id) || root.getElementById?.(id)));
    labels.push(
      element.getAttribute('aria-label'), element.getAttribute('placeholder'), element.getAttribute('title'),
      element.getAttribute('name'), element.id, textOf(element.closest('label'))
    );
    const container = element.closest([
      '.form-item', '.form-group', '.field', '.ant-form-item', '.el-form-item', '.ivu-form-item',
      '.arco-form-item', '.semi-form-field', '[class*="formItem"]', '[class*="form-item"]',
      '[class*="field-item"]', 'td', 'fieldset'
    ].join(','));
    if (container) {
      const explicit = container.querySelector('label,.ant-form-item-label,.el-form-item__label,.ivu-form-item-label,legend,[class*="label"]');
      labels.push(textOf(explicit));
      if (!explicit) labels.push(textOf(container).slice(0, 120));
    }
    const previous = element.previousElementSibling;
    if (previous && /^(LABEL|SPAN|DIV)$/.test(previous.tagName)) labels.push(textOf(previous).slice(0, 80));
    return [...new Set(labels.filter(Boolean))].join(' | ').slice(0, 300);
  }

  function canonicalElement(element) {
    const custom = element.closest(CUSTOM_SELECT_SELECTOR);
    return custom && isVisible(custom) ? custom : element;
  }

  function scanFields() {
    const fields = [];
    const seen = new Set();
    let index = 0;
    for (const raw of queryAllDeep(FIELD_SELECTOR)) {
      const element = canonicalElement(raw);
      if (seen.has(element) || !isVisible(element)) continue;
      seen.add(element);
      const label = getLabel(element) || getLabel(raw);
      if (!label) continue;
      let fieldId = element.getAttribute('data-quizmate-field');
      if (!fieldId) {
        fieldId = `${location.hostname.replace(/[^a-z0-9]/gi, '-')}-${Date.now().toString(36)}-${index++}`;
        element.setAttribute('data-quizmate-field', fieldId);
      }
      fields.push({
        fieldId, label, tag: element.tagName.toLowerCase(), type: element.getAttribute('type') || '',
        name: element.getAttribute('name') || '', value: getCurrentValue(element), required: isRequired(element),
        custom: element.matches(CUSTOM_SELECT_SELECTOR)
      });
    }
    return fields;
  }

  function getCurrentValue(element) {
    if (element.matches('input,textarea,select')) return element.value || '';
    return element.getAttribute('aria-valuetext') || element.getAttribute('data-value') || textOf(element).slice(0, 100);
  }

  function isRequired(element) {
    return element.matches('[required],[aria-required="true"]') || /[*＊]/.test(getLabel(element).slice(0, 8));
  }

  function matchProfile(fields, profileFields) {
    const mapping = [];
    for (const field of fields) {
      const haystack = normalize(`${field.label}|${field.name}|${field.fieldId}`);
      let best = null;
      for (const [key, rawValue] of Object.entries(profileFields || {})) {
        if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue;
        for (const alias of ALIASES[key] || [key]) {
          const needle = normalize(alias);
          if (!needle) continue;
          const score = haystack === needle ? 120 : haystack.startsWith(needle) ? 105 : haystack.includes(needle) ? 90 : 0;
          if (score && (!best || score > best.score)) best = { fieldId: field.fieldId, key, value: String(rawValue), score };
        }
      }
      if (best) mapping.push(best);
    }
    return mapping;
  }

  function setNativeValue(element, value) {
    const oldValue = element.value;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(element, value); else element.value = value;
    if (element._valueTracker) element._valueTracker.setValue(oldValue);
    element.setAttribute('value', value);
  }

  function dispatchValueEvents(element, value) {
    element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function clickLikeUser(element) {
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const EventClass = type.startsWith('pointer') && globalThis.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventClass(type, { bubbles: true, composed: true, cancelable: true, view: window }));
    }
  }

  function bestOption(options, value) {
    const desired = normalize(value);
    return options.find(option => normalize(option.getAttribute('data-value')) === desired || normalize(textOf(option)) === desired)
      || options.find(option => normalize(textOf(option)).includes(desired) || desired.includes(normalize(textOf(option))));
  }

  async function waitForOptions(value, timeout = 2500) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const options = queryAllDeep(OPTION_SELECTOR).filter(isVisible).filter(option => !option.matches('[aria-disabled="true"],.disabled,.is-disabled'));
      const match = bestOption(options, value);
      if (match) return match;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return null;
  }

  async function fillCustomSelect(element, value) {
    const trigger = element.querySelector('.ant-select-selector,.el-select__wrapper,.el-input__inner,input,[role="combobox"]') || element;
    trigger.focus?.();
    clickLikeUser(trigger);
    let option = await waitForOptions(value);
    if (!option) {
      const search = element.querySelector('input:not([type="hidden"])');
      if (search) {
        setNativeValue(search, value);
        dispatchValueEvents(search, value);
        await new Promise(resolve => setTimeout(resolve, 180));
        option = await waitForOptions(value, 1800);
      }
    }
    if (!option) return false;
    clickLikeUser(option);
    await new Promise(resolve => setTimeout(resolve, 80));
    return true;
  }

  function formatDateValue(element, value) {
    if (!['date', 'month'].includes(element.type)) return value;
    const match = String(value).match(/(\d{4})\D+(\d{1,2})(?:\D+(\d{1,2}))?/);
    if (!match) return value;
    const month = match[2].padStart(2, '0');
    return element.type === 'month' ? `${match[1]}-${month}` : `${match[1]}-${month}-${(match[3] || '01').padStart(2, '0')}`;
  }

  async function fillOne(item, overwrite = false) {
    const element = findDeepById(item.fieldId);
    if (!element || !isVisible(element)) return false;
    if (filledValues.get(element) === item.value) return false;
    if (element.matches(CUSTOM_SELECT_SELECTOR)) {
      const success = await fillCustomSelect(element, item.value);
      if (success) filledValues.set(element, item.value);
      return success;
    }
    if (element instanceof HTMLSelectElement) {
      const option = bestOption([...element.options], item.value);
      if (!option) return false;
      setNativeValue(element, option.value);
      dispatchValueEvents(element, option.value);
    } else if (element.matches('input[type="radio"]')) {
      const optionText = `${element.value} ${getLabel(element)}`;
      if (!normalize(optionText).includes(normalize(item.value))) return false;
      clickLikeUser(element);
    } else if (element.matches('input[type="checkbox"],[role="checkbox"]')) {
      const shouldCheck = /^(true|1|yes|y|是|有|接受)$/i.test(item.value.trim());
      if ('checked' in element && element.checked !== shouldCheck) clickLikeUser(element);
      else if (element.getAttribute('aria-checked') !== String(shouldCheck)) clickLikeUser(element);
    } else if (element.isContentEditable) {
      if (!overwrite && textOf(element)) return false;
      element.focus();
      element.textContent = item.value;
      dispatchValueEvents(element, item.value);
    } else if (element.matches('input,textarea')) {
      if (!overwrite && element.value && element.value !== item.value) return false;
      const value = formatDateValue(element, item.value);
      element.focus();
      setNativeValue(element, value);
      dispatchValueEvents(element, value);
      element.blur();
    } else return false;
    filledValues.set(element, item.value);
    return true;
  }

  async function fillProfile(profileFields, options = {}) {
    const fields = scanFields();
    const mapping = matchProfile(fields, profileFields);
    let filled = 0;
    for (const item of mapping) {
      try { if (await fillOne(item, Boolean(options.overwrite))) filled++; } catch {}
    }
    return { success: true, detected: fields.length, matched: mapping.length, filled };
  }

  async function runAutoFill() {
    const { autoFillEnabled = false, profiles = [], selectedProfileId = null } = await chrome.storage.local.get(['autoFillEnabled', 'profiles', 'selectedProfileId']);
    if (!autoFillEnabled) return;
    const profile = profiles.find(item => item.id === selectedProfileId) || profiles[0];
    if (profile?.fields) await fillProfile(profile.fields, { overwrite: false });
  }

  function scheduleAutoFill(delay = 350) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => runAutoFill().catch(() => {}), delay);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === 'detectForms') {
      const fields = scanFields();
      sendResponse({ success: true, count: fields.length, fields });
      return;
    }
    if (message?.action === 'fillProfile') {
      fillProfile(message.profileFields || {}, { overwrite: Boolean(message.overwrite) })
        .then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.autoFillEnabled || changes.selectedProfileId || changes.profiles)) scheduleAutoFill(100);
  });

  observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.type === 'childList' && mutation.addedNodes.length)) scheduleAutoFill(450);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleAutoFill(250);
})();
