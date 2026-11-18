import './index.css';
import { createRoot } from 'react-dom/client';
import Options from '@src/Options';
import Grant from '@src/Grant';
import Consent from '@src/Consent';

const container = document.getElementById('app-container');
if (!container) {
  throw new Error('Could not find #app-container');
}
createRoot(container).render(
  location.hash === '#grant' ? <Grant /> : location.hash === '#consent' ? <Consent /> : <Options />,
);
