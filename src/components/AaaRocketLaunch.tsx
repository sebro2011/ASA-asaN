import React from 'react';

export interface AaaRocketLaunchProps {
  className?: string;
  onLaunchComplete?: (result: { altitude: number; velocity: number }) => void;
}

export { AaaRocketLaunch } from '../../components/AaaRocketLaunch';
export { default } from '../../components/AaaRocketLaunch';
