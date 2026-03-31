import React, { useState, useRef, useCallback, useEffect } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

declare global {
  interface Window { google?: any; __mapsReady?: () => void; }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// Bootstrap: carga el script una sola vez usando el nuevo loader "loading=async"
let bootstrapPromise: Promise<void> | null = null;

function bootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) { resolve(); return; }
    window.__mapsReady = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&loading=async&language=es&callback=__mapsReady`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error('Error al cargar Google Maps'));
    document.head.appendChild(s);
  });
  return bootstrapPromise;
}

// Carga la librería "places" (nueva Places API)
let placesLibPromise: Promise<any> | null = null;

async function loadPlacesLib(): Promise<any> {
  await bootstrap();
  if (!placesLibPromise) {
    placesLibPromise = window.google.maps.importLibrary('places');
  }
  return placesLibPromise;
}

export interface AddressSelection {
  /** Calle + número */
  streetAddress: string;
  /** Localidad / municipio */
  city: string;
  /** Provincia */
  province: string;
  /** Código postal */
  postalCode: string;
  /** País en español */
  country: string;
  /** Dirección completa formateada por Google */
  fullAddress: string;
}

interface Prediction {
  place_id: string;
  description: string;
  /** referencia interna de la nueva API para llamar toPlace() */
  _placePrediction: any;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selection: AddressSelection) => void;
  placeholder?: string;
  className?: string;
}

/** Extrae el longText del primer address_component que tenga alguno de los types dados */
function getComp(components: any[], ...types: string[]): string {
  for (const t of types) {
    const found = components.find((c: any) => c.types.includes(t));
    if (found) return found.longText ?? found.long_name ?? '';
  }
  return '';
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = 'Escribe para buscar dirección...',
  className = '',
}) => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [libReady, setLibReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const libRef = useRef<any>(null);  // { AutocompleteSuggestion, AutocompleteSessionToken, Place }
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    loadPlacesLib()
      .then((lib) => {
        libRef.current = lib;
        setLibReady(true);
      })
      .catch(console.error);
  }, []);

  /** Crea un nuevo session token (agrupa autocomplete + fetchFields = 1 transacción) */
  const ensureSessionToken = useCallback(() => {
    if (!sessionTokenRef.current && libRef.current?.AutocompleteSessionToken) {
      sessionTokenRef.current = new libRef.current.AutocompleteSessionToken();
    }
  }, []);

  const search = useCallback(async (query: string) => {
    if (!libReady || !libRef.current || query.trim().length < 3) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }
    ensureSessionToken();
    setIsLoading(true);
    try {
      const { suggestions } = await libRef.current.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        language: 'es',
        includedPrimaryTypes: ['address'],
        sessionToken: sessionTokenRef.current,
      });
      if (suggestions?.length) {
        const preds: Prediction[] = suggestions.map((s: any) => ({
          place_id: s.placePrediction.placeId,
          description: s.placePrediction.text.text,
          _placePrediction: s.placePrediction,
        }));
        setPredictions(preds);
        setShowDropdown(true);
      } else {
        setPredictions([]);
        setShowDropdown(false);
      }
    } catch (err) {
      console.error('Places autocomplete error:', err);
      setPredictions([]);
      setShowDropdown(false);
    } finally {
      setIsLoading(false);
    }
  }, [libReady, ensureSessionToken]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  const handleSelect = async (pred: Prediction) => {
    setPredictions([]);
    setShowDropdown(false);

    if (!pred._placePrediction) {
      onChange(pred.description);
      onSelect({ streetAddress: pred.description, city: '', province: '', postalCode: '', country: '', fullAddress: pred.description });
      return;
    }

    try {
      const place = pred._placePrediction.toPlace();
      // fetchFields consume el session token → autocomplete + details = 1 transacción
      await place.fetchFields({ fields: ['addressComponents', 'formattedAddress'], language: 'es' });
      // Invalidar el token tras usarlo
      sessionTokenRef.current = null;

      const comps: any[] = place.addressComponents ?? [];

      const route        = getComp(comps, 'route');
      const streetNumber = getComp(comps, 'street_number');
      const city         = getComp(comps, 'locality', 'sublocality_level_1', 'administrative_area_level_3', 'administrative_area_level_2');
      const province     = getComp(comps, 'administrative_area_level_2', 'administrative_area_level_1');
      const postalCode   = getComp(comps, 'postal_code');
      const country      = getComp(comps, 'country');
      const fullAddress  = place.formattedAddress ?? pred.description;
      const streetAddress = [route, streetNumber].filter(Boolean).join(', ');

      onChange(streetAddress || pred.description);
      onSelect({ streetAddress: streetAddress || pred.description, city, province, postalCode, country, fullAddress });
    } catch (err) {
      console.error('Place details error:', err);
      onChange(pred.description);
      onSelect({ streetAddress: pred.description, city: '', province: '', postalCode: '', country: '', fullAddress: pred.description });
      sessionTokenRef.current = null;
    }
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
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
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

      {showDropdown && predictions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-64 overflow-y-auto divide-y divide-slate-100">
          {predictions.map((p) => (
            <li
              key={p.place_id}
              onMouseDown={() => handleSelect(p)}
              className="flex items-start gap-2 px-3 py-2.5 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-indigo-400 shrink-0" />
              <span className="leading-snug">{p.description}</span>
            </li>
          ))}
          <li className="px-3 py-1.5 flex justify-end bg-white">
            <img
              src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3_hdpi.png"
              alt="Powered by Google"
              className="h-4 opacity-70"
            />
          </li>
        </ul>
      )}
    </div>
  );
};
