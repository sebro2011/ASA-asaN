'use client';

import React from 'react';
import SolarWeather from './SolarWeather.jsx';

/**
 * SolarWeatherAlertCard Alias
 * Points directly to SolarWeather to guarantee clean in-flow text without
 * any absolute background clipping bars or overlay issues.
 */
export function SolarWeatherAlertCard(props) {
  return <SolarWeather {...props} />;
}

export default SolarWeather;
