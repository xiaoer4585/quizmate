import assert from 'node:assert/strict';
import { createExampleProfileRecord, createProfileRecord, normalizeProfile, toOfferFlowProfile, valueAtPath } from '../profile-schema.js';

const record = createProfileRecord('测试简历');
record.profile = normalizeProfile({
  basic: { name: '张三', phone: '13800000000', email: 'zhangsan@example.com' },
  intention: { position: '产品经理', cities: '上海' },
  educations: [
    { level: '硕士', school: 'A大学', major: '计算机', startDate: '2024-09', endDate: '2027-06' },
    { level: '本科', school: 'B大学', major: '软件工程', startDate: '2020-09', endDate: '2024-06' }
  ],
  internships: [{ company: '甲公司', position: '产品实习生', startDate: '2025-01', endDate: '2025-06' }],
  works: [{ company: '乙公司', position: '产品经理', startDate: '2025-07', endDate: '至今' }],
  projects: [{ name: '智能求职助手', role: '负责人' }],
  customFields: [{ label: '是否接受出差', value: '是' }]
});

const mapped = toOfferFlowProfile(record.profile);
assert.equal(mapped.values.fullName, '张三');
assert.equal(mapped.values.school, 'A大学');
assert.equal(mapped.values.experienceOrganization, '甲公司');
assert.equal(mapped.values['是否接受出差'], '是');
assert.equal(mapped.snapshots[1].school, 'B大学');
assert.equal(mapped.snapshots[1].experienceOrganization, '乙公司');
assert.equal(mapped.repeatCounts.education, 2);
assert.equal(mapped.repeatCounts.experience, 2);
assert.deepEqual(mapped.repeatPlan.experience.internshipIndexes, [0]);
assert.deepEqual(mapped.repeatPlan.experience.workIndexes, [1]);
assert.equal(valueAtPath(record.profile, 'educations[1].school'), 'B大学');
assert.equal(valueAtPath(record.profile, 'basic.missing'), '');

const example = createExampleProfileRecord();
assert.equal(example.name, '示例简历（可直接测试）');
assert.equal(example.profile.basic.name, '李明');
assert.ok(example.profile.educations.length >= 2);
assert.ok(example.profile.internships.length >= 1);
assert.ok(example.profile.works.length >= 1);
assert.ok(example.profile.projects.length >= 1);
assert.ok(example.profile.campus.length >= 1);
assert.ok(example.profile.family.length >= 1);
assert.ok(example.profile.awards.length >= 1);
assert.ok(example.profile.trainings.length >= 1);
assert.ok(example.profile.customFields.length >= 1);

console.log('profile-schema tests passed');
