import { useEffect, useState } from 'react';
import type { MatchConsoleResponse } from '../../lib/api-client.js';

/** The operator's side, person, staff and secondary-field picks, with the defaults filled in on each load. */
export function useMatchConsoleSelection(projection: MatchConsoleResponse) {
  const [selectedSide, setSelectedSide] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  // Keyed by payload field name (e.g. 'assistedBy') rather than one fixed
  // field, since which fields a definition declares varies by discipline —
  // ambient state applied to whichever button gets clicked next, the same
  // pattern the side/person/staff selectors above already use.
  const [secondaryActorSelections, setSecondaryActorSelections] = useState<Record<string, string>>(
    {},
  );
  // Which field a JerseyGrid tap currently sets — undefined means the
  // primary actor (selectedSide/selectedPersonId), a field name means that
  // secondary field (see JerseyGrid.tsx's own "ambient selection" note).
  const [activeSecondaryField, setActiveSecondaryField] = useState<string | undefined>(undefined);

  // A default side/person/staff selection, filled in whenever it is
  // still unset — on first render and again after every reload, the same
  // moment `MatchConsolePage`'s own `reload()` used to fill it in directly,
  // before this state lived here instead. Nested inside a promise chain
  // rather than called directly in the effect body — the same
  // react-hooks/set-state-in-effect workaround `PreferencesPage.tsx`
  // established for several setState calls reachable from one effect.
  useEffect(() => {
    Promise.resolve().then(() => {
      setSelectedSide((current) => current || projection.entrants[0]?.entrantId || '');
      setSelectedPersonId((current) => current || projection.eligiblePersonIds[0] || '');
      setSelectedStaffId((current) => current || projection.eligibleStaffIds[0] || '');
    });
  }, [projection]);
  return {
    activeSecondaryField,
    secondaryActorSelections,
    selectedPersonId,
    selectedSide,
    selectedStaffId,
    setActiveSecondaryField,
    setSecondaryActorSelections,
    setSelectedPersonId,
    setSelectedSide,
    setSelectedStaffId,
  };
}

/** The selection state and its setters, as the template and the record section share them. */
export type MatchConsoleSelection = ReturnType<typeof useMatchConsoleSelection>;
