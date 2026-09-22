const { getButtonConfig } = require('./config/db');

const DEFAULTS = {
  webapp: { text: '💎 Galería Virtual 💎', style: 'primary' },
  modelos: { text: '👑 Lista de Modelos 👑', style: 'danger', callback_data: 'public_modelos' },
  canal_free: { text: '📢 Canal OFICIAL 📢', style: 'success' },
  bueno: { text: '🟢 BUENO', style: 'success' },
  malo: { text: '🔴 MALO', style: 'danger' },
  contacto: { text: '📞 CONTACTO', style: 'primary' }
};

function normalizeStyle(style) {
  return ['primary', 'success', 'danger'].includes(String(style).toLowerCase())
    ? String(style).toLowerCase() : 'primary';
}

async function button(key, extra = {}) {
  const all = await getButtonConfig();
  const section = extra.section ? String(extra.section) : '';
  const cleanExtra = { ...extra };
  delete cleanExtra.section;
  const sectionConfig = section && all[section] && typeof all[section] === 'object' ? all[section] : {};
  const c = Object.assign(
    {},
    DEFAULTS[key] || { text: key, style: 'primary' },
    all[key] || {},
    sectionConfig[key] || {},
    cleanExtra
  );
  const out = {
    text: c.text,
    style: normalizeStyle(c.style),
    ...(c.callback_data ? { callback_data: String(c.callback_data) } : {}),
    ...(c.url ? { url: String(c.url) } : {}),
    ...(c.web_app ? { web_app: c.web_app } : {}),
    ...cleanExtra
  };
  if (c.icon_custom_emoji_id) out.icon_custom_emoji_id = String(c.icon_custom_emoji_id);
  return out;
}
async function urlButton(key, url, extra = {}) { return button(key, { url, ...extra }); }
async function webAppButton(key, url, extra = {}) {
  return button(key, { web_app: { url }, ...extra });
}
module.exports = { button, urlButton, webAppButton, DEFAULTS, normalizeStyle };