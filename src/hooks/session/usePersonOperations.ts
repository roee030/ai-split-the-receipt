import type { SplitSession, Person } from '../../types/split.types';
import type { Dispatch, SetStateAction } from 'react';
import { generateId } from '../../utils/idGenerator';
import { getPersonColor, getPersonInitials } from '../../utils/colorPalette';

type Setter = Dispatch<SetStateAction<SplitSession>>;

export function makePersonOperations(setSession: Setter) {
  return {
    addPerson: (name: string) =>
      setSession((s) => {
        const index = s.people.length;
        const person: Person = {
          id: generateId(),
          name,
          color: getPersonColor(index),
          avatar: getPersonInitials(name || '?'),
        };
        return { ...s, people: [...s.people, person] };
      }),

    removePerson: (id: string) =>
      setSession((s) => ({
        ...s,
        people: s.people.filter((p) => p.id !== id),
        claims: s.claims
          .map((c) => ({
            ...c,
            personIds: c.personIds.filter((pid) => pid !== id),
          }))
          .filter((c) => c.personIds.length > 0),
      })),

    updatePersonName: (id: string, name: string) =>
      setSession((s) => ({
        ...s,
        people: s.people.map((p) =>
          p.id === id ? { ...p, name, avatar: getPersonInitials(name || '?') } : p
        ),
      })),

    setSplitMode: (splitMode: SplitSession['splitMode']) =>
      setSession((s) => ({ ...s, splitMode })),
  };
}
