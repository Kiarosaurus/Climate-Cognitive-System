// Semantic threshold colors for sensor-reading table cells.
// Shared by GlobalDashboard and RoomDetail so both tables stay in sync.
//
// Dentro de rango → gris neutro (#7a96b5, texto secundario); fuera de rango
// escala amarillo → naranja → rojo. Devuelve una clase Tailwind de color de texto.

const NORMAL = 'text-[#7a96b5]'   // muted secondary text — NOT an accent color
const WARN = 'text-yellow-500'    // #eab308
const HIGH = 'text-orange-500'    // #f97316
const ALERT = 'text-red-500'      // #ef4444

// Temperatura: desviación absoluta respecto al target ajustado del aula.
export function getColorTemp(value: number, target: number): string {
  const d = Math.abs(value - target)
  if (d <= 1) return NORMAL
  if (d <= 2) return WARN
  if (d <= 3) return HIGH
  return ALERT
}

export function getColorHumedad(value: number): string {
  if (value < 60) return NORMAL
  if (value <= 70) return WARN
  if (value <= 80) return HIGH
  return ALERT
}

export function getColorCO2(value: number): string {
  if (value < 800) return NORMAL
  if (value <= 1200) return WARN
  if (value <= 1500) return HIGH
  return ALERT
}

export function getColorCO(value: number): string {
  if (value < 10) return NORMAL
  if (value <= 30) return WARN
  if (value <= 50) return HIGH
  return ALERT
}
