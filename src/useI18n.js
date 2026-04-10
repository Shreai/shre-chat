// React hook for i18n — triggers re-render on locale change
import { useState, useEffect } from 'react';
import { t, getLocale, setLocale, subscribe, getAvailableLocales, LOCALE_LABELS, } from './i18n';
export function useI18n() {
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        return subscribe(() => forceUpdate((n) => n + 1));
    }, []);
    return {
        t,
        locale: getLocale(),
        setLocale,
        LOCALE_LABELS,
    };
}
export function useAvailableLocales() {
    const [locales, setLocales] = useState([]);
    useEffect(() => {
        getAvailableLocales().then(setLocales);
    }, []);
    return locales;
}
