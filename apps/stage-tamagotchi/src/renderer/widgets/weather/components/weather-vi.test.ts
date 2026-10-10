import { describe, expect, it } from 'vitest'
import { vietnameseWeatherCity, vietnameseWeatherCondition } from './weather-vi'

describe('BÔNG weather widget Vietnamese labels', () => {
  it('shows current overcast condition in Vietnamese', () => {
    expect(vietnameseWeatherCondition('Overcast')).toBe('Trời nhiều mây')
  })
  it('translates every Open-Meteo weather descriptor to Vietnamese', () => {
    const english = [
      'Clear sky', 'Mainly clear', 'Partly cloudy', 'Overcast', 'Fog', 'Depositing rime fog',
      'Light drizzle', 'Moderate drizzle', 'Dense drizzle', 'Freezing drizzle',
      'Dense freezing drizzle', 'Slight rain', 'Moderate rain', 'Heavy rain',
      'Freezing rain', 'Heavy freezing rain', 'Slight snow', 'Moderate snow',
      'Heavy snow', 'Snow grains', 'Slight rain showers', 'Moderate rain showers',
      'Violent rain showers', 'Slight snow showers', 'Heavy snow showers',
      'Thunderstorm', 'Thunderstorm with slight hail', 'Thunderstorm with heavy hail', 'Unknown',
    ]
    for (const condition of english) {
      expect(vietnameseWeatherCondition(condition)).not.toBe(condition)
    }
  })
  it('localizes the city name while preserving names not mapped', () => {
    expect(vietnameseWeatherCity('Hanoi')).toBe('Hà Nội')
    expect(vietnameseWeatherCity('Ha Noi')).toBe('Hà Nội')
    expect(vietnameseWeatherCity('Tokyo')).toBe('Tokyo')
  })
  it('shows a transparent fallback when data is missing', () => {
    expect(vietnameseWeatherCondition()).toBe('Chưa có dữ liệu')
    expect(vietnameseWeatherCity()).toBe('Chưa rõ địa điểm')
  })
})
