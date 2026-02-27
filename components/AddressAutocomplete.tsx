import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

export interface AddressSelection {
  /** Calle + número + ciudad + provincia (sin CP ni país) */
  streetAddress: string;
  postalCode: string;
  country: string;
  /** Dirección completa en una sola línea */
  fullAddress: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Llamado cuando el usuario elige una sugerencia */
  onSelect: (selection: AddressSelection) => void;
  placeholder?: string;
  className?: string;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = 'Escribe para buscar dirección…',
  className = '',
}) => {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 4) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=6`,
        {
          signal: abortRef.current.signal,
          headers: {
            'Accept-Language': 'es',
            'User-Agent': 'dygo-therapy-app/1.0',
          },
        }
      );
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setShowDropdown(data.length > 0);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setSuggestions([]);
        setShowDropdown(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 600);
  };

  const buildAddressSelection = (result: NominatimResult): AddressSelection => {
    const a = result.address;

    const street = [a.road, a.house_number].filter(Boolean).join(', ');
    const city = a.city || a.town || a.village || a.municipality || a.county || '';
    const state = a.state || '';
    const streetAddress = [street, city, state].filter(Boolean).join(', ');
    const postalCode = a.postcode || '';
    const country = a.country || '';
    const fullAddress = [streetAddress, postalCode, country].filter(Boolean).join(', ');

    return { streetAddress, postalCode, country, fullAddress };
  };

  const handleSelect = (result: NominatimResult) => {
    const selection = buildAddressSelection(result);
    onChange(selection.streetAddress);
    onSelect(selection);
    setSuggestions([]);
    setShowDropdown(false);
  };

  // Cierra el dropdown al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          ) : (
            <MapPin className="w-4 h-4" />
          )}
        </div>
      </div>

      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-64 overflow-y-auto divide-y divide-slate-100">
          {suggestions.map((s) => (
            <li
              key={s.place_id}
              onMouseDown={() => handleSelect(s)}
              className="flex items-start gap-2 px-3 py-2.5 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-indigo-400 shrink-0" />
              <span className="leading-snug">{s.display_name}</span>
            </li>
          ))}
          <li className="px-3 py-1.5 text-[10px] text-slate-400 text-right">
            © OpenStreetMap contributors
          </li>
        </ul>
      )}
    </div>
  );
};
