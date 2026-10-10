"""Route documentation; unknown schemas stay unknown."""

from .collector import routes, file_ref
from .models import section


def generate(model, scope=None):
    selected = [route for route in routes(model) if not scope or scope in (route.get("file"), route.get("path"))]
    if not selected:
        return [section("api-unavailable", "API routes", unknowns=["No matching statically detected routes are available."])]
    result = []
    for index, route in enumerate(selected):
        path = route.get("file") or ""
        result.append(section(f"route-{index}", f"{route.get('method', 'ALL')} {route.get('path', 'Unknown')}",
            facts=[f"Handler: {route.get('handler') or 'Unknown / not statically determined'}",
                   f"Framework: {route.get('framework') or 'Unknown'}", f"Source: {path}"],
            unknowns=["Parameters, request body, response schema, and middleware are unknown unless established in the repository model."],
            citations=[file_ref(path, model, route.get("handler"))]))
    return result
