// v14 - deja pasar a todos pero guarda el status
module.exports = async (ctx, next) => {
  // Aquí luego metemos la lógica de vencimiento
  // Por ahora solo continúa
  return next();
};
