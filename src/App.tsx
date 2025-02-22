import React, { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { ApiKeyInput } from './components/ApiKeyInput';
import { USFMConverter } from './components/USFMConverter';

function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    return localStorage.getItem('openrouter_api_key');
  });

  const handleApiKeySubmit = (key: string) => {
    localStorage.setItem('openrouter_api_key', key);
    setApiKey(key);
  };

  const handleLogout = () => {
    localStorage.removeItem('openrouter_api_key');
    setApiKey(null);
  };

  return (
    <>
      <Toaster position="top-right" />
      {!apiKey ? (
        <ApiKeyInput onSubmit={handleApiKeySubmit} />
      ) : (
        <USFMConverter apiKey={apiKey} onLogout={handleLogout} />
      )}
    </>
  );
}

export default App;