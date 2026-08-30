import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";

const UserContext = createContext();
export const useUser = () => useContext(UserContext);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /* =========================================================
      🔥 LOGIN
  ========================================================= */
  const login = async (email, password) => {
    const res = await signInWithEmailAndPassword(auth, email, password);
    const uid = res.user.uid;

    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) throw new Error("Perfil no encontrado");

    const data = snap.data();

    setUser({
      uid,
      email: res.user.email,
      role: data.role,
      profile: data.profile,
      credits: data.credits || null,
    });

    return data.role;
  };

  /* =========================================================
      🔥 REGISTER
  ========================================================= */
  const register = async (email, password, role, profileData) => {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    const uid = res.user.uid;

    const userData = {
      email,
      role,
      profile: { ...profileData },
      ...(role === "profesional" && {
        credits: {
          balance: 10,
          totalEarned: 10,
          totalSpent: 0,
        },
        mercadoPago: {
          connected: false,
          userId: null,
          connectedAt: null,
        },
      }),
      createdAt: Date.now(),
    };

    await setDoc(doc(db, "users", uid), userData);

    setUser({
      uid,
      email,
      role,
      profile: profileData,
      credits: userData.credits || null,
    });

    return role;
  };

  /* =========================================================
      🔥 LOGOUT
  ========================================================= */
  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      // Opcional: navigate("/") es preferible a href si usas react-router
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  /* =========================================================
      🔥 LISTENER AUTH + FIRESTORE EN TIEMPO REAL
  ========================================================= */
  useEffect(() => {
    let unsubscribeFirestore = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // 1. Si el usuario cierra sesión, limpiamos TODO inmediatamente
      if (!firebaseUser) {
        if (unsubscribeFirestore) {
          unsubscribeFirestore();
          unsubscribeFirestore = null;
        }
        setUser(null);
        setLoading(false);
        return;
      }

      const uid = firebaseUser.uid;
      const userRef = doc(db, "users", uid);

      // 2. Iniciamos el listener de Firestore
      unsubscribeFirestore = onSnapshot(
        userRef,
        (snap) => {
          if (!snap.exists()) {
            setUser(null);
            setLoading(false);
            return;
          }

          const data = snap.data();
          setUser({
            uid,
            email: firebaseUser.email,
            role: data.role,
            profile: data.profile,
            credits: data.credits || null,
          });

          setLoading(false);
        },
        (error) => {
          // 🛡️ Filtramos el error de permisos si ocurre durante el cierre de sesión
          if (error.code !== "permission-denied") {
            console.error("Error escuchando perfil:", error);
          }
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubscribeFirestore) unsubscribeFirestore();
      unsubscribeAuth();
    };
  }, []);

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}