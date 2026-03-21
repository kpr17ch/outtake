# Plugin Integration

Partner plugins can register custom operations via entry points:

`[project.entry-points."outtake.operation_plugins"]`

Each plugin should expose:

`register_plugin(registry: OperationRegistry) -> None`
