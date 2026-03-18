import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'chatbot_user';
const FREE_CHAT_KEY = 'chatbot_free_chat_used';

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

  /** Call this with the decoded Google credential payload */
  const login = useCallback((googleUser) => {
    const profile = {
      name: googleUser.name,
      email: googleUser.email,
      picture: googleUser.picture,
      sub: googleUser.sub,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    setUser(profile);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(FREE_CHAT_KEY);
    setUser(null);
  }, []);

  /** Mark that the guest has used their one free chat */
  const markFreeChatUsed = useCallback(() => {
    localStorage.setItem(FREE_CHAT_KEY, '1');
  }, []);

  const isFreeChatUsed = useCallback(() => {
    return localStorage.getItem(FREE_CHAT_KEY) === '1';
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, markFreeChatUsed, isFreeChatUsed }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
