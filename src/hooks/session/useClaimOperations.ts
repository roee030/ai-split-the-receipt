import type { SplitSession, ItemClaim } from '../../types/split.types';
import type { Dispatch, SetStateAction } from 'react';

type Setter = Dispatch<SetStateAction<SplitSession>>;

export function makeClaimOperations(setSession: Setter) {
  return {
    claimItem: (itemId: string, personId: string) =>
      setSession((s) => {
        const item = s.receiptItems.find((i) => i.id === itemId);
        const isMulti = (item?.quantity ?? 1) > 1;
        const existing = s.claims.find((c) => c.itemId === itemId);

        if (!existing) {
          const claim: ItemClaim = { itemId, personIds: [personId] };
          if (isMulti) claim.quantityPerPerson = { [personId]: 1 };
          return { ...s, claims: [...s.claims, claim] };
        }

        if (existing.personIds.includes(personId)) {
          // unclaim — remove person
          const newPersonIds = existing.personIds.filter((id) => id !== personId);
          if (newPersonIds.length === 0) {
            return { ...s, claims: s.claims.filter((c) => c.itemId !== itemId) };
          }
          const newQPP = existing.quantityPerPerson
            ? Object.fromEntries(
                Object.entries(existing.quantityPerPerson).filter(([k]) => k !== personId)
              )
            : undefined;
          return {
            ...s,
            claims: s.claims.map((c) =>
              c.itemId === itemId
                ? { ...c, personIds: newPersonIds, quantityPerPerson: newQPP }
                : c
            ),
          };
        }

        // add person to existing claim
        const newQPP = isMulti
          ? { ...(existing.quantityPerPerson ?? {}), [personId]: 1 }
          : existing.quantityPerPerson;
        return {
          ...s,
          claims: s.claims.map((c) =>
            c.itemId === itemId
              ? { ...c, personIds: [...c.personIds, personId], quantityPerPerson: newQPP }
              : c
          ),
        };
      }),

    setClaimQuantity: (itemId: string, personId: string, qty: number) =>
      setSession((s) => {
        const existing = s.claims.find((c) => c.itemId === itemId);
        if (!existing) {
          if (qty <= 0) return s;
          return {
            ...s,
            claims: [
              ...s.claims,
              {
                itemId,
                personIds: [personId],
                quantityPerPerson: { [personId]: qty },
              },
            ],
          };
        }
        if (qty <= 0) {
          const newPersonIds = existing.personIds.filter((id) => id !== personId);
          if (newPersonIds.length === 0) {
            return { ...s, claims: s.claims.filter((c) => c.itemId !== itemId) };
          }
          const newQPP = { ...(existing.quantityPerPerson ?? {}) };
          delete newQPP[personId];
          return {
            ...s,
            claims: s.claims.map((c) =>
              c.itemId === itemId
                ? { ...c, personIds: newPersonIds, quantityPerPerson: newQPP }
                : c
            ),
          };
        }
        const newQPP = { ...(existing.quantityPerPerson ?? {}), [personId]: qty };
        const newPersonIds = existing.personIds.includes(personId)
          ? existing.personIds
          : [...existing.personIds, personId];
        return {
          ...s,
          claims: s.claims.map((c) =>
            c.itemId === itemId
              ? { ...c, personIds: newPersonIds, quantityPerPerson: newQPP }
              : c
          ),
        };
      }),

    setSharedClaim: (itemId: string, personIds: string[], sharedUnits = 1) =>
      setSession((s) => {
        const filtered = s.claims.filter((c) => c.itemId !== itemId);
        if (personIds.length === 0) return { ...s, claims: filtered };

        // Distribute shared units equally as fractions per person
        const qtyEach = sharedUnits / personIds.length;
        const quantityPerPerson: Record<string, number> = {};
        for (const pid of personIds) {
          quantityPerPerson[pid] = qtyEach;
        }

        return {
          ...s,
          claims: [...filtered, { itemId, personIds, quantityPerPerson }],
        };
      }),

    splitEvenly: () =>
      setSession((s) => {
        const allPersonIds = s.people.map((p) => p.id);
        const unclaimedItems = s.receiptItems.filter(
          (item) => !s.claims.find((c) => c.itemId === item.id)
        );
        const newClaims: ItemClaim[] = unclaimedItems.map((item) => ({
          itemId: item.id,
          personIds: allPersonIds,
        }));
        return { ...s, claims: [...s.claims, ...newClaims] };
      }),
  };
}
