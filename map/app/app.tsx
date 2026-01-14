import React from 'react';
import MapCanvas from './MapCanvas';
import Sidebar from './UI/Sidebar';

const App = () => {
  return (
    <div className="relative h-screen w-screen text-gray-100 font-sans">
      <MapCanvas />
      <Sidebar />
    </div>
  );
};

export default App;