# Security policy

## Supported versions

Only the latest release gets security fixes.

## Reporting a vulnerability

Please report security problems privately through
[GitHub's private vulnerability reporting](https://github.com/royandre/previewer/security/advisories/new), not in a
public issue. Include what an attacker could do, the steps to reproduce, and the Previewer and Chrome versions.

You can expect an answer within a week. Once a fix is released, the advisory is published with credit to you unless you
prefer otherwise.

## Scope

Previewer removes `X-Frame-Options` and `Content-Security-Policy` from pages shown inside the preview, in that tab only,
while the preview is open. That is by design and documented. Reports about that rule applying outside that tab, outside
framed documents, or after the preview is closed are in scope.
