import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'chatbot_user';
const TOKEN_KEY = 'chatbot_google_token';

function parseStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(parseStoredUser);
  const [credential, setCredential] = useState(() => localStorage.getItem(TOKEN_KEY) || null);

  /** Call this with the raw Google credential + decoded payload */
  const login = useCallback((googleUser, rawCredential) => {
    const profile = {
      name: googleUser.name,
      email: googleUser.email,
      picture: googleUser.picture,
      sub: googleUser.sub,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    if (rawCredential) {
      localStorage.setItem(TOKEN_KEY, rawCredential);
      setCredential(rawCredential);
    }
    setUser(profile);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setCredential(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, credential, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
