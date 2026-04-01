import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export interface ScanHistoryItem {
  id: string;
  createdAt: Date;
  restaurantName: string | null;
  total: number;
  currency: string;
  itemCount: number;
}

export function useScanHistory() {
  const { user } = useAuth();
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) { setHistory([]); return; }

    setLoading(true);
    const scansRef = collection(db, 'users', user.uid, 'scans');
    const q = query(scansRef, orderBy('createdAt', 'desc'), limit(20));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: ScanHistoryItem[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate() ?? new Date(),
        restaurantName: doc.data().restaurantName ?? null,
        total: doc.data().total ?? 0,
        currency: doc.data().currency ?? 'ILS',
        itemCount: doc.data().itemCount ?? 0,
      }));
      setHistory(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  return { history, loading };
}
