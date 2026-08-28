"""Shared rate-limiter instance used across all route modules.

Import this ``limiter`` object wherever you need the ``@limiter.limit()``
decorator.  The same instance must also be attached to ``app.state.limiter``
in the application factory so that slowapi's exception handler works.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
