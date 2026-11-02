// Retired: notifications open their event in Bani; there is no inbox page.
import {Navigate} from 'react-router-dom';
export default function Notifications(){return <Navigate to='/?bani_event=summary' replace/>;}
