import { afterEach } from 'vitest';
import { disposeTestSimulations } from './helpers/simLifetime';

afterEach(disposeTestSimulations);
