import './helpers/env.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  getSkill,
  listUserSkills,
  normalizeSkillName,
  parseSkill,
  removeSkill,
  saveSkill,
  userSkillsDir,
} from '../src/services/skillManager.js';
import { createUser } from '../src/db/users.js';

const user = createUser({ email: 'skills@example.com', password: 'password123' });

test('parseSkill lee el frontmatter YAML', () => {
  const parsed = parseSkill('---\nname: Mi Skill\ndescription: Hace cosas\n---\n\n# Cuerpo');
  assert.equal(parsed.name, 'mi-skill');
  assert.equal(parsed.description, 'Hace cosas');
});

test('parseSkill cae al título si no hay frontmatter', () => {
  const parsed = parseSkill('# Resumidor\n\nResume textos largos.');
  assert.equal(parsed.name, 'resumidor');
  assert.equal(parsed.description, 'Resume textos largos.');
});

test('normalizeSkillName limpia caracteres peligrosos', () => {
  assert.equal(normalizeSkillName('../../etc/passwd'), 'etc-passwd');
  assert.equal(normalizeSkillName('Hola Mundo!!'), 'hola-mundo');
});

test('saveSkill escribe en /data/skills/<user_id>/ y lo registra', () => {
  const skill = saveSkill(user.id, { content: '# Traductor\n\nTraduce textos.', filename: 'traductor.md' });
  assert.equal(skill.name, 'traductor');
  const file = `${userSkillsDir(user.id)}/traductor.md`;
  assert.equal(fs.existsSync(file), true);
  assert.match(fs.readFileSync(file, 'utf8'), /Traduce textos/);
});

test('saveSkill no permite escapar del directorio del usuario', () => {
  const skill = saveSkill(user.id, { content: '# Malo', filename: '../../../../tmp/evil.md' });
  assert.equal(skill.filename, 'evil.md');
  assert.ok(fs.existsSync(`${userSkillsDir(user.id)}/evil.md`));
  assert.equal(fs.existsSync('/tmp/evil.md'), false);
});

test('el mismo nombre actualiza en vez de duplicar', () => {
  saveSkill(user.id, { content: '# Traductor\n\nVersión 2.', filename: 'traductor.md' });
  const conTraductor = listUserSkills(user.id).filter((skill) => skill.name === 'traductor');
  assert.equal(conTraductor.length, 1);
  assert.match(getSkill(user.id, conTraductor[0].id).content, /Versión 2/);
});

test('saveSkill rechaza contenido vacío', () => {
  assert.throws(() => saveSkill(user.id, { content: '   ' }), (error) => error.status === 400);
});

test('removeSkill borra el registro y el archivo', () => {
  const [skill] = listUserSkills(user.id);
  const file = `${userSkillsDir(user.id)}/${skill.filename}`;
  assert.ok(fs.existsSync(file));
  removeSkill(user.id, skill.id);
  assert.equal(fs.existsSync(file), false);
  assert.equal(getSkill(user.id, skill.id), null);
});
