import React from 'react';
import MapCanvas from './MapCanvas';
import Sidebar from './UI/Sidebar';

const App = () => {
  return (
    <div className="flex h-full w-full text-gray-100 font-sans overflow-hidden">
      <MapCanvas />
      <Sidebar />
    </div>
  );
};

export default App;