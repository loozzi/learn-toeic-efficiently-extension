import { bootstrap, shouldRunHere } from './index';

if (shouldRunHere(location.href)) bootstrap();
