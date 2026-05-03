export interface CognitiveAction {
  ac_status: 'ON' | 'STANDBY'
  cooling_mode: string | null
  target: number | null
  thermal_load_offset: number
  model: 'ml' | 'heuristic' | 'none'
}

export interface RoomContext {
  room_id: number
  room_name: string
  max_capacity: number
  target_temp: number
  expected_people: number | null
}

export interface SensorReadingResponse {
  sensor_id: string
  anomaly_detected: boolean
  inserted_id: string
  timestamp: string
  cognitive_action: CognitiveAction
  room_context?: RoomContext
}

export interface ReadingInput {
  sensor_id: string
  temperature: number
  humidity: number
  co2_ppm: number
}

export interface CombinedReading {
  input: ReadingInput
  output: SensorReadingResponse
  sentAt: number
}
