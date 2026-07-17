import './index.css';
import { createRoot } from 'react-dom/client';
import Options from '@src/Options';

const container = document.getElementById('app-container');
if (!container) {
  throw new Error('Could not find #app-container');
}
createRoot(container).render(<Options />);
