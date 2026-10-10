// Display-only Vietnamese labels; leave weather codes and raw API values intact
// for the icon renderer and LLM tool summary.
const conditionTranslations: Record<string, string> = {
  'clear sky': 'Trời quang',
  'mainly clear': 'Chủ yếu trời quang',
  'partly cloudy': 'Có mây rải rác',
  'overcast': 'Trời nhiều mây',
  'fog': 'Sương mù',
  'depositing rime fog': 'Sương mù đóng băng',
  'light drizzle': 'Mưa phùn nhẹ',
  'moderate drizzle': 'Mưa phùn vừa',
  'dense drizzle': 'Mưa phùn dày',
  'freezing drizzle': 'Mưa phùn đóng băng',
  'dense freezing drizzle': 'Mưa phùn đóng băng dày',
  'slight rain': 'Mưa nhỏ',
  'moderate rain': 'Mưa vừa',
  'heavy rain': 'Mưa to',
  'freezing rain': 'Mưa đóng băng',
  'heavy freezing rain': 'Mưa đóng băng mạnh',
  'slight snow': 'Tuyết nhẹ',
  'moderate snow': 'Tuyết vừa',
  'heavy snow': 'Tuyết dày',
  'snow grains': 'Tuyết hạt',
  'slight rain showers': 'Mưa rào nhẹ',
  'moderate rain showers': 'Mưa rào vừa',
  'violent rain showers': 'Mưa rào rất to',
  'slight snow showers': 'Tuyết rơi nhẹ',
  'heavy snow showers': 'Tuyết rơi dày',
  'thunderstorm': 'Dông',
  'thunderstorm with slight hail': 'Dông kèm mưa đá nhẹ',
  'thunderstorm with heavy hail': 'Dông kèm mưa đá lớn',
  'unknown': 'Chưa rõ thời tiết',
}

export function vietnameseWeatherCondition(condition?: string): string {
  if (!condition?.trim())
    return 'Chưa có dữ liệu'
  return conditionTranslations[condition.trim().toLocaleLowerCase('en')] ?? condition
}

export function vietnameseWeatherCity(city?: string): string {
  if (!city?.trim())
    return 'Chưa rõ địa điểm'
  const value = city.trim()
  if (/^(hanoi|ha noi|hà nội)$/iu.test(value))
    return 'Hà Nội'
  if (/^(ho chi minh city|saigon|sai gon|hồ chí minh)$/iu.test(value))
    return 'TP. Hồ Chí Minh'
  if (/^(da nang|danang|đà nẵng)$/iu.test(value))
    return 'Đà Nẵng'
  return value
}
