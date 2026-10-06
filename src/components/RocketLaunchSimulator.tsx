import React from 'react';

export interface RocketLaunchSimulatorProps {
  className?: string;
  onComplete?: (result: { altitude: number; velocity: number; fuel: number }) => void;
}

export { RocketLaunchSimulator } from '../../components/RocketLaunchSimulator';
export { default } from '../../components/RocketLaunchSimulator';
