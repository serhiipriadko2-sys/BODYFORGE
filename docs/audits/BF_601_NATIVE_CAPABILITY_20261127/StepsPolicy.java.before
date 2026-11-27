package ru.bodyforge.healthqa;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

final class StepsPolicy {
    static final String HOST = "appassets.androidplatform.net";
    static final String PATH = "/__bodyforge_native/steps";
    static final String USER_AGENT_TOKEN = "BODYFORGE-NativeSteps/1";

    private StepsPolicy() {}

    private static URI local(String raw) {
        try {
            URI uri = URI.create(raw);
            return "https".equals(uri.getScheme()) && HOST.equals(uri.getRawAuthority()) ? uri : null;
        } catch (RuntimeException error) {
            return null;
        }
    }

    static boolean isReservedPath(String raw) {
        URI uri = local(raw);
        return uri != null && PATH.equals(uri.getPath());
    }

    static boolean allowsOpen(String page, String target, boolean mainFrame,
                              boolean gesture, boolean redirect, String method) {
        URI source = local(page);
        URI destination = local(target);
        return mainFrame && gesture && !redirect && "GET".equals(method)
            && source != null && source.getRawQuery() == null
            && ("/".equals(source.getRawPath()) || "/index.html".equals(source.getRawPath()))
            && destination != null && PATH.equals(destination.getRawPath())
            && destination.getRawQuery() == null && destination.getRawFragment() == null;
    }

    static final class DayWindow {
        final LocalDate day;
        final ZoneId zone;
        final Instant start, end;
        DayWindow(Instant now, ZoneId zone) {
            this.zone = zone;
            day = now.atZone(zone).toLocalDate();
            start = day.atStartOfDay(zone).toInstant();
            end = now;
        }
        boolean valid() { return end.isAfter(start); }
        boolean isCurrent(Instant now, ZoneId currentZone) {
            return zone.equals(currentZone) && day.equals(now.atZone(currentZone).toLocalDate())
                && !now.isBefore(end);
        }
    }

    static boolean validCount(Long count) {
        return count != null && count >= 0L;
    }
}
