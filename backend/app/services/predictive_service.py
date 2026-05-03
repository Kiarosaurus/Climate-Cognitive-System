THERMAL_LOAD_PER_PERSON = 0.05  # °C added per expected person


async def calculate_cooling_demand(current_temp: float, room_context: dict) -> dict:
    expected_people = (room_context or {}).get("expected_people") or 0
    target_temp = (room_context or {}).get("target_temp")

    if not room_context or not expected_people or target_temp is None:
        return {"ac_status": "STANDBY", "cooling_mode": None, "target": target_temp}

    thermal_load = round(expected_people * THERMAL_LOAD_PER_PERSON, 2)
    adjusted_target = round(target_temp - thermal_load, 2)

    if current_temp > adjusted_target:
        return {
            "ac_status": "ON",
            "cooling_mode": "PRE-COOLING",
            "target": adjusted_target,
            "thermal_load_offset": thermal_load,
        }
    return {
        "ac_status": "STANDBY",
        "cooling_mode": None,
        "target": adjusted_target,
        "thermal_load_offset": thermal_load,
    }
