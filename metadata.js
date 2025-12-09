// KaiSign metadata service - EXACT same approach as Snaps repo
console.log('[KaiSign] Loading metadata service...');

// =============================================================================
// METADATA SOURCE CONFIGURATION - LOCAL SWITCH
// =============================================================================
const USE_LOCAL_METADATA = true; // Set to true to use local files instead of subgraph/blobs
const LOCAL_METADATA_PATH = 'local-metadata'; // Path to local metadata files (relative to current directory)

const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/117022/kaisign-subgraph/version/latest';
const BLOBSCAN_URL = 'https://api.sepolia.blobscan.com';

// Embedded Safe Proxy Factory metadata (base64 encoded) - with selectors
const EMBEDDED_SAFE_METADATA = "ewogICIkc2NoZW1hIjogIi4uLy4uL2VyYzc3MzAtdjEuc2NoZW1hLmpzb24iLAogICJjb250ZXh0IjogewogICAgImNvbnRyYWN0IjogewogICAgICAiYWJpIjogWwogICAgICAgIHsKICAgICAgICAgICJpbnB1dHMiOiBbCiAgICAgICAgICAgIHsibmFtZSI6ICJfc2luZ2xldG9uIiwgInR5cGUiOiAiYWRkcmVzcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiaW5pdGlhbGl6ZXIiLCAidHlwZSI6ICJieXRlcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAic2FsdE5vbmNlIiwgInR5cGUiOiAidWludDI1NiJ9CiAgICAgICAgICBdLAogICAgICAgICAgIm5hbWUiOiAiY3JlYXRlUHJveHlXaXRoTm9uY2UiLAogICAgICAgICAgIm91dHB1dHMiOiBbeyJuYW1lIjogInByb3h5IiwgInR5cGUiOiAiYWRkcmVzcyJ9XSwKICAgICAgICAgICJzdGF0ZU11dGFiaWxpdHkiOiAibm9ucGF5YWJsZSIsCiAgICAgICAgICAidHlwZSI6ICJmdW5jdGlvbiIsCiAgICAgICAgICAic2VsZWN0b3IiOiAiMHgxNjg4ZjBiOSIKICAgICAgICB9LAogICAgICAgIHsKICAgICAgICAgICJpbnB1dHMiOiBbCiAgICAgICAgICAgIHsibmFtZSI6ICJfc2luZ2xldG9uIiwgInR5cGUiOiAiYWRkcmVzcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiaW5pdGlhbGl6ZXIiLCAidHlwZSI6ICJieXRlcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAic2FsdE5vbmNlIiwgInR5cGUiOiAidWludDI1NiJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiY2FsbGJhY2siLCAidHlwZSI6ICJhZGRyZXNzIn0KICAgICAgICAgIF0sCiAgICAgICAgICAibmFtZSI6ICJjcmVhdGVQcm94eVdpdGhDYWxsYmFjayIsCiAgICAgICAgICAib3V0cHV0cyI6IFt7Im5hbWUiOiAicHJveHkiLCAidHlwZSI6ICJhZGRyZXNzIn1dLAogICAgICAgICAgInN0YXRlTXV0YWJpbGl0eSI6ICJub25wYXlhYmxlIiwKICAgICAgICAgICJ0eXBlIjogImZ1bmN0aW9uIiwKICAgICAgICAgICJzZWxlY3RvciI6ICIweGQxOGFmNTRkIgogICAgICAgIH0sCiAgICAgICAgewogICAgICAgICAgImlucHV0cyI6IFsKICAgICAgICAgICAgeyJuYW1lIjogIl9zaW5nbGV0b24iLCAidHlwZSI6ICJhZGRyZXNzIn0sCiAgICAgICAgICAgIHsibmFtZSI6ICJpbml0aWFsaXplciIsICJ0eXBlIjogImJ5dGVzIn0sCiAgICAgICAgICAgIHsibmFtZSI6ICJzYWx0IiwgInR5cGUiOiAiYnl0ZXMzMiJ9CiAgICAgICAgICBdLAogICAgICAgICAgIm5hbWUiOiAiY3JlYXRlUHJveHkiLAogICAgICAgICAgIm91dHB1dHMiOiBbeyJuYW1lIjogInByb3h5IiwgInR5cGUiOiAiYWRkcmVzcyJ9XSwKICAgICAgICAgICJzdGF0ZU11dGFiaWxpdHkiOiAibm9ucGF5YWJsZSIsCiAgICAgICAgICAidHlwZSI6ICJmdW5jdGlvbiIsCiAgICAgICAgICAic2VsZWN0b3IiOiAiMHg0ZjkyN2M5MyIKICAgICAgICB9LAogICAgICAgIHsKICAgICAgICAgICJpbnB1dHMiOiBbCiAgICAgICAgICAgIHsibmFtZSI6ICJfc2luZ2xldG9uIiwgInR5cGUiOiAiYWRkcmVzcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiaW5pdGlhbGl6ZXIiLCAidHlwZSI6ICJieXRlcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAic2FsdE5vbmNlIiwgInR5cGUiOiAidWludDI1NiJ9CiAgICAgICAgICBdLAogICAgICAgICAgIm5hbWUiOiAiY2FsY3VsYXRlQ3JlYXRlUHJveXlXaXRoTm9uY2VBZGRyZXNzIiwKICAgICAgICAgICJvdXRwdXRzIjogW3sibmFtZSI6ICJwcm94eSIsICJ0eXBlIjogImFkZHJlc3MifV0sCiAgICAgICAgICAic3RhdGVNdXRhYmlsaXR5IjogInZpZXciLAogICAgICAgICAgInR5cGUiOiAiZnVuY3Rpb24iLAogICAgICAgICAgInNlbGVjdG9yIjogIjB4MjUwMDUxMGUiCiAgICAgICAgfQogICAgICBdLAogICAgICAiZGVwbG95bWVudHMiOiB7CiAgICAgICAgIm1haW5uZXQiOiB7CiAgICAgICAgICAiYWRkcmVzcyI6ICIweDRlMWRjZjdhZDRlNDYwY2ZkMzA3OTFjY2M0ZjljOGE0ZjgyMGVjNjciLAogICAgICAgICAgImNoYWluSWQiOiAxCiAgICAgICAgfSwKICAgICAgICAic2Vwb2xpYSI6IHsKICAgICAgICAgICJhZGRyZXNzIjogIjB4NGUxZGNmN2FkNGU0NjBjZmQzMDc5MWNjYzRmOWM4YTRmODIwZWM2NyIsCiAgICAgICAgICAiY2hhaW5JZCI6IDExMTU1MTExCiAgICAgICAgfSwKICAgICAgICAicG9seWdvbiI6IHsKICAgICAgICAgICJhZGRyZXNzIjogIjB4NGUxZGNmN2FkNGU0NjBjZmQzMDc5MWNjYzRmOWM4YTRmODIwZWM2NyIsCiAgICAgICAgICAiY2hhaW5JZCI6IDEzNwogICAgICAgIH0KICAgICAgfQogICAgfQogIH0sCiAgIm1ldGFkYXRhIjogewogICAgIm93bmVyIjogIlNhZmUgRWNvc3lzdGVtIEZvdW5kYXRpb24iLAogICAgImluZm8iOiB7CiAgICAgICJ1cmwiOiAiaHR0cHM6Ly9zYWZlLmdsb2JhbCIsCiAgICAgICJsZWdhbE5hbWUiOiAiU2FmZSBFY29zeXN0ZW0gRm91bmRhdGlvbiIsCiAgICAgICJsYXN0VXBkYXRlIjogIjIwMjQtMTEtMjciCiAgICB9LAogICAgInRva2VuIjogewogICAgICAic3RhbmRhcmQiOiAibm9uZSIKICAgIH0KICB9LAogICJkaXNwbGF5IjogewogICAgImZvcm1hdHMiOiB7CiAgICAgICJjcmVhdGVQcm94eVdpdGhOb25jZSI6IHsKICAgICAgICAiaW50ZW50IjogewogICAgICAgICAgInR5cGUiOiAiY2FsbGRhdGEiLAogICAgICAgICAgImZvcm1hdCI6IFsKICAgICAgICAgICAgewogICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAiZGlyZWN0aW9uIjogImNvbHVtbiIsCiAgICAgICAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAidGV4dCIsCiAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiaGVhZGluZzIiLAogICAgICAgICAgICAgICAgICAidmFsdWUiOiAiQ3JlYXRlIFNhZmUgV2FsbGV0IgogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJyb3ciLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJTYWZlIEltcGxlbWVudGF0aW9uOiIKICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogImFkZHJlc3MiLAogICAgICAgICAgICAgICAgICAgICAgInBhdGgiOiAiX3NpbmdsZXRvbiIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImFkZHJlc3NOYW1lIgogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgXQogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJyb3ciLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJTYWx0IE5vbmNlOiIKICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogImFtb3VudCIsCiAgICAgICAgICAgICAgICAgICAgICAicGF0aCI6ICJzYWx0Tm9uY2UiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJ1bml0IgogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgXQogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJjb2x1bW4iLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJJbml0aWFsaXphdGlvbiBEYXRhOiIKICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogImNhbGxkYXRhIiwKICAgICAgICAgICAgICAgICAgICAgICJwYXRoIjogImluaXRpYWxpemVyIiwKICAgICAgICAgICAgICAgICAgICAgICJ0byI6ICIkLl9zaW5nbGV0b24iCiAgICAgICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgICAgICBdCiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgXQogICAgICAgICAgICB9CiAgICAgICAgICBdCiAgICAgICAgfQogICAgICB9LAogICAgICAiY3JlYXRlUHJveHlXaXRoQ2FsbGJhY2siOiB7CiAgICAgICAgImludGVudCI6IHsKICAgICAgICAgICJ0eXBlIjogImNhbGxkYXRhIiwKICAgICAgICAgICJmb3JtYXQiOiBbCiAgICAgICAgICAgIHsKICAgICAgICAgICAgICAidHlwZSI6ICJjb250YWluZXIiLAogICAgICAgICAgICAgICJsYXlvdXQiOiAiZmxleCIsCiAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJjb2x1bW4iLAogICAgICAgICAgICAgICJmaWVsZHMiOiBbCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImhlYWRpbmcyIiwKICAgICAgICAgICAgICAgICAgInZhbHVlIjogIkNyZWF0ZSBTYWZlIFdhbGxldCB3aXRoIENhbGxiYWNrIgogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJyb3ciLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJTYWZlIEltcGxlbWVudGF0aW9uOiIKICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogImFkZHJlc3MiLAogICAgICAgICAgICAgICAgICAgICAgInBhdGgiOiAiX3NpbmdsZXRvbiIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImFkZHJlc3NOYW1lIgogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgXQogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJyb3ciLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJTYWx0IE5vbmNlOiIKICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogImFtb3VudCIsCiAgICAgICAgICAgICAgICAgICAgICAicGF0aCI6ICJzYWx0Tm9uY2UiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJ1bml0IgogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgXQogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJyb3ciLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJDYWxsYmFjayBDb250cmFjdDoiCiAgICAgICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAidHlwZSI6ICJhZGRyZXNzIiwKICAgICAgICAgICAgICAgICAgICAgICJwYXRoIjogImNhbGxiYWNrIiwKICAgICAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiYWRkcmVzc05hbWUiCiAgICAgICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgICAgICBdCiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAidHlwZSI6ICJjb250YWluZXIiLAogICAgICAgICAgICAgICAgICAibGF5b3V0IjogImZsZXgiLAogICAgICAgICAgICAgICAgICAiZGlyZWN0aW9uIjogImNvbHVtbiIsCiAgICAgICAgICAgICAgICAgICJmaWVsZHMiOiBbCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAgInR5cGUiOiAidGV4dCIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImJvbGQiLAogICAgICAgICAgICAgICAgICAgICAgInZhbHVlIjogIkluaXRpYWxpemF0aW9uIERhdGE6IgogICAgICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY2FsbGRhdGEiLAogICAgICAgICAgICAgICAgICAgICAgInBhdGgiOiAiaW5pdGlhbGl6ZXIiLAogICAgICAgICAgICAgICAgICAgICAgInRvIjogIiQuX3NpbmdsZXRvbiIKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgIF0KICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICBdCiAgICAgICAgICAgIH0KICAgICAgICAgIF0KICAgICAgICB9CiAgICAgIH0sCiAgICAgICJjcmVhdGVQcm94eSI6IHsKICAgICAgICAiaW50ZW50IjogewogICAgICAgICAgInR5cGUiOiAiY2FsbGRhdGEiLAogICAgICAgICAgImZvcm1hdCI6IFsKICAgICAgICAgICAgewogICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAiZGlyZWN0aW9uIjogImNvbHVtbiIsCiAgICAgICAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAidGV4dCIsCiAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiaGVhZGluZzIiLAogICAgICAgICAgICAgICAgICAidmFsdWUiOiAiQ3JlYXRlIFNhZmUgV2FsbGV0IFByb3h5IgogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJyb3ciLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJTYWZlIEltcGxlbWVudGF0aW9uOiIKICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogImFkZHJlc3MiLAogICAgICAgICAgICAgICAgICAgICAgInBhdGgiOiAiX3NpbmdsZXRvbiIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImFkZHJlc3NOYW1lIgogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgXQogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJyb3ciLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJTYWx0OiIKICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgInBhdGgiOiAic2FsdCIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImhleCIKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgIF0KICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgICAgICJsYXlvdXQiOiAiZmxleCIsCiAgICAgICAgICAgICAgICAgICJkaXJlY3Rpb24iOiAiY29sdW1uIiwKICAgICAgICAgICAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAidHlwZSI6ICJ0ZXh0IiwKICAgICAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiYm9sZCIsCiAgICAgICAgICAgICAgICAgICAgICAidmFsdWUiOiAiSW5pdGlhbGl6YXRpb24gRGF0YToiCiAgICAgICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAidHlwZSI6ICJjYWxsZGF0YSIsCiAgICAgICAgICAgICAgICAgICAgICAicGF0aCI6ICJpbml0aWFsaXplciIsCiAgICAgICAgICAgICAgICAgICAgICAidG8iOiAiJC5fc2luZ2xldG9uIgogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgXQogICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgIF0KICAgICAgICAgICAgfQogICAgICAgICAgXQogICAgICAgIH0KICAgICAgfQogICAgfQogIH0KfQ==";

// Embedded Permit2 metadata (base64 encoded) - with selector
const EMBEDDED_PERMIT2_METADATA = "ewogICIkc2NoZW1hIjogIi4uLy4uL2VyYzc3MzAtdjEuc2NoZW1hLmpzb24iLAogICJjb250ZXh0IjogewogICAgImNvbnRyYWN0IjogewogICAgICAiYWJpIjogWwogICAgICAgIHsKICAgICAgICAgICJ0eXBlIjogImZ1bmN0aW9uIiwKICAgICAgICAgICJuYW1lIjogImFwcHJvdmUiLAogICAgICAgICAgInNlbGVjdG9yIjogIjB4ODc1MTdjNDUiLAogICAgICAgICAgImlucHV0cyI6IFsKICAgICAgICAgICAgeyJuYW1lIjogInRva2VuIiwgInR5cGUiOiAiYWRkcmVzcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAic3BlbmRlciIsICJ0eXBlIjogImFkZHJlc3MifSwKICAgICAgICAgICAgeyJuYW1lIjogImFtb3VudCIsICJ0eXBlIjogInVpbnQxNjAifSwKICAgICAgICAgICAgeyJuYW1lIjogImV4cGlyYXRpb24iLCAidHlwZSI6ICJ1aW50NDgifQogICAgICAgICAgXSwKICAgICAgICAgICJvdXRwdXRzIjogW10KICAgICAgICB9CiAgICAgIF0KICAgIH0KICB9LAogICJkaXNwbGF5IjogewogICAgImZvcm1hdHMiOiB7CiAgICAgICJhcHByb3ZlKGFkZHJlc3MsYWRkcmVzcyx1aW50MTYwLHVpbnQ0OCkiOiB7CiAgICAgICAgImludGVudCI6ICJBcHByb3ZlIHthbW91bnR9IGZvciB7c3BlbmRlcn0iLAogICAgICAgICJmaWVsZHMiOiBbCiAgICAgICAgICB7CiAgICAgICAgICAgICJwYXRoIjogInRva2VuIiwKICAgICAgICAgICAgImxhYmVsIjogIlRva2VuIiwKICAgICAgICAgICAgImZvcm1hdCI6ICJhZGRyZXNzTmFtZSIKICAgICAgICAgIH0sCiAgICAgICAgICB7CiAgICAgICAgICAgICJwYXRoIjogInNwZW5kZXIiLAogICAgICAgICAgICAibGFiZWwiOiAiU3BlbmRlciIsCiAgICAgICAgICAgICJmb3JtYXQiOiAiYWRkcmVzc05hbWUiCiAgICAgICAgICB9LAogICAgICAgICAgewogICAgICAgICAgICAicGF0aCI6ICJhbW91bnQiLAogICAgICAgICAgICAibGFiZWwiOiAiQW1vdW50IiwKICAgICAgICAgICAgImZvcm1hdCI6ICJhbW91bnQiCiAgICAgICAgICB9CiAgICAgICAgXQogICAgICB9CiAgICB9CiAgfSwKICAibWV0YWRhdGEiOiB7CiAgICAib3duZXIiOiAiVW5pc3dhcCIsCiAgICAiaW5mbyI6IHsKICAgICAgInVybCI6ICJodHRwczovL2dpdGh1Yi5jb20vVW5pc3dhcC9wZXJtaXQyIiwKICAgICAgImxlZ2FsTmFtZSI6ICJQZXJtaXQyIiwKICAgICAgImxhc3RVcGRhdGUiOiAiMjAyNS0wMS0wOSIKICAgIH0KICB9Cn0K";

// Embedded Universal Router metadata (base64 encoded) - with selector
const EMBEDDED_UNIVERSAL_ROUTER_METADATA = "ewogICIkc2NoZW1hIjogIi4uLy4uL2VyYzc3MzAtdjEuc2NoZW1hLmpzb24iLAogICJjb250ZXh0IjogewogICAgImNvbnRyYWN0IjogewogICAgICAiYWJpIjogWwogICAgICAgIHsKICAgICAgICAgICJ0eXBlIjogImZ1bmN0aW9uIiwKICAgICAgICAgICJuYW1lIjogImV4ZWN1dGUiLAogICAgICAgICAgInNlbGVjdG9yIjogIjB4MzU5MzU2NGMiLAogICAgICAgICAgImlucHV0cyI6IFsKICAgICAgICAgICAgeyJuYW1lIjogImNvbW1hbmRzIiwgInR5cGUiOiAiYnl0ZXMifSwKICAgICAgICAgICAgeyJuYW1lIjogImlucHV0cyIsICJ0eXBlIjogImJ5dGVzW10ifSwKICAgICAgICAgICAgeyJuYW1lIjogImRlYWRsaW5lIiwgInR5cGUiOiAidWludDI1NiJ9CiAgICAgICAgICBdLAogICAgICAgICAgIm91dHB1dHMiOiBbXQogICAgICAgIH0KICAgICAgXQogICAgfQogIH0sCiAgImRpc3BsYXkiOiB7CiAgICAiZm9ybWF0cyI6IHsKICAgICAgImV4ZWN1dGUoYnl0ZXMsYnl0ZXNbXSx1aW50MjU2KSI6IHsKICAgICAgICAiaW50ZW50IjogewogICAgICAgICAgImZvcm1hdCI6IFsKICAgICAgICAgICAgewogICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgImZvcm1hdCI6ICJjYXJkIiwKICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAidHlwZSI6ICJ0ZXh0IiwKICAgICAgICAgICAgICAgICAgInZhbHVlIjogIkV4ZWN1dGUgdmlhIFVuaXZlcnNhbCBSb3V0ZXIiLAogICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImhlYWRpbmcyIgogICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgIF0KICAgICAgICAgICAgfQogICAgICAgICAgXQogICAgICAgIH0sCiAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgIHsKICAgICAgICAgICAgInBhdGgiOiAiY29tbWFuZHMiLAogICAgICAgICAgICAibGFiZWwiOiAiQ29tbWFuZHMiLAogICAgICAgICAgICAiZm9ybWF0IjogInJhdyIKICAgICAgICAgIH0sCiAgICAgICAgICB7CiAgICAgICAgICAgICJwYXRoIjogImRlYWRsaW5lIiwKICAgICAgICAgICAgImxhYmVsIjogIkRlYWRsaW5lIiwKICAgICAgICAgICAgImZvcm1hdCI6ICJyYXciCiAgICAgICAgICB9CiAgICAgICAgXQogICAgICB9CiAgICB9CiAgfSwKICAibWV0YWRhdGEiOiB7CiAgICAib3duZXIiOiAiVW5pc3dhcCIsCiAgICAiaW5mbyI6IHsKICAgICAgInVybCI6ICJodHRwczovL2dpdGh1Yi5jb20vVW5pc3dhcC91bml2ZXJzYWwtcm91dGVyIiwKICAgICAgImxlZ2FsTmFtZSI6ICJVbml2ZXJzYWwgUm91dGVyIiwKICAgICAgImxhc3RVcGRhdGUiOiAiMjAyNS0wMS0wOSIKICAgIH0KICB9Cn0=";

// Contract mappings now loaded from registry (see registry-loader.js)
// Uses local-metadata/registry/contract-mappings.json
// Fallback function to get contract mapping from registry or return null
function getContractMetadataPath(contractAddress) {
  const normalized = contractAddress.toLowerCase();
  // Use registry loader if available
  if (window.registryLoader?.contractMappings?.mappings) {
    return window.registryLoader.contractMappings.mappings[normalized] || null;
  }
  return null;
}

// Get all mapped contract addresses
function getAllMappedContracts() {
  if (window.registryLoader?.contractMappings?.mappings) {
    return Object.keys(window.registryLoader.contractMappings.mappings);
  }
  return [];
}

console.log(`[Metadata] Source mode: ${USE_LOCAL_METADATA ? 'LOCAL' : 'REMOTE (subgraph+blobs)'}`);
if (USE_LOCAL_METADATA) {
  // Count will be available after registry loader initializes
  setTimeout(() => {
    console.log(`[Metadata] Local contracts mapped: ${getAllMappedContracts().length}`);
  }, 100);
}

// Metadata cache
const metadataCache = {};

// =============================================================================
// LOCAL METADATA LOADING FUNCTIONS
// =============================================================================

async function loadLocalMetadata(contractAddress, chainId) {
  try {
    console.log(`[Metadata] LOADING - Contract: ${contractAddress}`);
    console.log(`[Metadata] LOADING - Available mappings:`, getAllMappedContracts());

    // Check for embedded Safe metadata first
    if (contractAddress === '0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67' || contractAddress === '0x4E1DCf7ad4E460CfD30791CCc4F9c8A4f820eC67') {
      console.log(`[Metadata] ✅ Using embedded Safe Proxy Factory metadata`);
      try {
        const decodedMetadata = atob(EMBEDDED_SAFE_METADATA);
        const metadata = JSON.parse(decodedMetadata);
        console.log(`[Metadata] ✅ Loaded embedded Safe metadata`);
        console.log(`[Metadata] Metadata keys:`, Object.keys(metadata));
        return metadata;
      } catch (decodeError) {
        console.log(`[Metadata] ❌ Failed to decode embedded metadata:`, decodeError.message);
      }
    }

    // Check for embedded Permit2 metadata
    const permit2Address = contractAddress.toLowerCase();
    if (permit2Address === '0x000000000022d473030f116ddee9f6b43ac78ba3') {
      console.log(`[Metadata] ✅ Using embedded Permit2 metadata`);
      try {
        const decodedMetadata = atob(EMBEDDED_PERMIT2_METADATA);
        const metadata = JSON.parse(decodedMetadata);
        console.log(`[Metadata] ✅ Loaded embedded Permit2 metadata`);
        console.log(`[Metadata] Metadata keys:`, Object.keys(metadata));
        return metadata;
      } catch (decodeError) {
        console.log(`[Metadata] ❌ Failed to decode embedded Permit2 metadata:`, decodeError.message);
      }
    }

    // Check for embedded Universal Router metadata
    const universalRouterAddress = contractAddress.toLowerCase();
    if (universalRouterAddress === '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad' || universalRouterAddress === '0x66a9893cc07d91d95644aedd05d03f95e1dba8af') {
      console.log(`[Metadata] ✅ Using embedded Universal Router metadata`);
      try {
        const decodedMetadata = atob(EMBEDDED_UNIVERSAL_ROUTER_METADATA);
        const metadata = JSON.parse(decodedMetadata);
        console.log(`[Metadata] ✅ Loaded embedded Universal Router metadata`);
        console.log(`[Metadata] Metadata keys:`, Object.keys(metadata));
        return metadata;
      } catch (decodeError) {
        console.log(`[Metadata] ❌ Failed to decode embedded Universal Router metadata:`, decodeError.message);
      }
    }
    
    const metadataFile = getContractMetadataPath(contractAddress);
    if (!metadataFile) {
      console.log(`[Metadata] ❌ No local mapping for contract: ${contractAddress}`);
      return null;
    }
    
    const filePath = `${LOCAL_METADATA_PATH}/${metadataFile}`;
    console.log(`[Metadata] ✅ Found mapping: ${filePath}`);
    console.log(`[Metadata] Current location: ${window.location.href}`);
    console.log(`[Metadata] Current origin: ${window.location.origin}`);
    console.log(`[Metadata] Document base URI: ${document.baseURI}`);
    
    try {
      // Since we're running on app.safe.global, we need to construct the extension URL
      // Check all script sources to debug what's available
      let extensionUrl = null;
      const allScripts = document.querySelectorAll('script[src]');
      console.log(`[Metadata] All script sources:`, Array.from(allScripts).map(s => s.src));
      
      // Look for extension-injected scripts
      const extensionScripts = Array.from(allScripts).filter(s => s.src.includes('chrome-extension://'));
      console.log(`[Metadata] Extension scripts:`, extensionScripts.map(s => s.src));
      
      // Also check for any global variables that might indicate extension context
      console.log(`[Metadata] Window chrome:`, typeof window.chrome);
      console.log(`[Metadata] Window browser:`, typeof window.browser);
      console.log(`[Metadata] Chrome runtime:`, window.chrome?.runtime);
      console.log(`[Metadata] Chrome runtime id:`, window.chrome?.runtime?.id);
      console.log(`[Metadata] Chrome runtime getURL:`, typeof window.chrome?.runtime?.getURL);
      console.log(`[Metadata] Extension context test:`, window.location.protocol);
      
      // Test if we can access chrome.runtime.getURL properly now
      if (window.chrome?.runtime?.getURL) {
        try {
          const testUrl = window.chrome.runtime.getURL('test');
          console.log(`[Metadata] Test getURL result:`, testUrl);
        } catch (testError) {
          console.log(`[Metadata] Test getURL failed:`, testError.message);
        }
      }
      
      // Try to detect extension ID from any available source
      if (extensionScripts.length > 0) {
        const extensionScript = extensionScripts[0].src;
        const extensionId = extensionScript.match(/chrome-extension:\/\/([a-z]+)\//)?.[1];
        if (extensionId) {
          extensionUrl = `chrome-extension://${extensionId}/${filePath}`;
          console.log(`[Metadata] Built extension URL: ${extensionUrl}`);
        }
      } else {
        // Try to get extension ID from chrome.runtime if available in any form
        try {
          if (window.chrome && window.chrome.runtime && window.chrome.runtime.id) {
            extensionUrl = `chrome-extension://${window.chrome.runtime.id}/${filePath}`;
            console.log(`[Metadata] Built URL from runtime ID: ${extensionUrl}`);
          } else if (window.chrome && window.chrome.runtime && window.chrome.runtime.getURL) {
            // Try using getURL method
            try {
              extensionUrl = window.chrome.runtime.getURL(filePath);
              console.log(`[Metadata] Built URL from runtime.getURL: ${extensionUrl}`);
            } catch (getUrlError) {
              console.log(`[Metadata] runtime.getURL failed: ${getUrlError.message}`);
            }
          }
        } catch (e) {
          console.log(`[Metadata] Chrome runtime access failed: ${e.message}`);
        }
      }
      
      // Try extension URL first, then fallback to relative
      const fetchUrl = extensionUrl || filePath;
      console.log(`[Metadata] Attempting fetch from: ${fetchUrl}`);
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        console.log(`[Metadata] ❌ Local file not found: ${response.status} - ${filePath}`);
        return null;
      }
      
      const metadata = await response.json();
      console.log(`[Metadata] ✅ Loaded local metadata from ${filePath}`);
      console.log(`[Metadata] Metadata keys:`, Object.keys(metadata));
      
      return metadata;
      
    } catch (fetchError) {
      console.log(`[Metadata] Local file fetch failed:`, fetchError.message);
      return null;
    }
    
  } catch (error) {
    console.error(`[Metadata] Error loading local metadata:`, error);
    return null;
  }
}

// Switch configuration functions
window.useLocalMetadata = function() {
  console.log('🔄 To use LOCAL metadata: Set USE_LOCAL_METADATA = true and reload');
};

window.useRemoteMetadata = function() {
  console.log('🔄 To use REMOTE metadata: Set USE_LOCAL_METADATA = false and reload');
};

window.getMetadataConfig = function() {
  return {
    mode: USE_LOCAL_METADATA ? 'LOCAL' : 'REMOTE',
    localPath: LOCAL_METADATA_PATH,
    contractsMapped: getAllMappedContracts().length,
    cache: Object.keys(metadataCache).length
  };
};

// Expose functions for testing
window.getContractMetadataPath = getContractMetadataPath;
window.getAllMappedContracts = getAllMappedContracts;
window.USE_LOCAL_METADATA = USE_LOCAL_METADATA;
window.LOCAL_METADATA_PATH = LOCAL_METADATA_PATH;

// Get contract metadata
async function getContractMetadata(contractAddress, chainId) {
  const normalizedAddress = contractAddress.toLowerCase();
  const cacheKey = `${normalizedAddress}-${chainId}`;
  
  console.log(`[Metadata] ===== METADATA FETCH =====`);
  console.log(`[Metadata] Contract: ${normalizedAddress}`);
  console.log(`[Metadata] ChainId: ${chainId}`);
  console.log(`[Metadata] Cache key: ${cacheKey}`);
  console.log(`[Metadata] Source: ${USE_LOCAL_METADATA ? 'LOCAL' : 'REMOTE'}`);
  console.log(`[Metadata] CONTRACT MAPPING CHECK:`, !!getContractMetadataPath(normalizedAddress));
  console.log(`[Metadata] ALL AVAILABLE CONTRACTS:`, getAllMappedContracts());
  
  if (metadataCache[cacheKey]) {
    console.log(`[Metadata] ✅ Cache hit for ${cacheKey}`);
    return metadataCache[cacheKey];
  }
  
  // LOCAL METADATA MODE - Check for local files first
  if (USE_LOCAL_METADATA) {
    console.log(`[Metadata] 📁 LOCAL MODE - Checking local metadata files`);
    const localMetadata = await loadLocalMetadata(normalizedAddress, chainId);
    if (localMetadata) {
      metadataCache[cacheKey] = localMetadata;
      return localMetadata;
    }
    console.log(`[Metadata] ❌ No local metadata found, falling back to remote`);
  }
  
  try {
    console.log(`[Metadata] 🔍 Querying subgraph for: ${normalizedAddress}`);
    
    // Query subgraph for blob hash
    const query = {
      query: `{ 
        specs(where: {targetContract: "${normalizedAddress}"}) { 
          blobHash 
          targetContract 
          status 
        } 
      }`
    };
    
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors',
      body: JSON.stringify(query)
    });
    
    if (!response.ok) {
      console.log(`[Metadata] Subgraph error: ${response.status}`);
      return null;
    }
    
    const result = await response.json();
    
    // Get FINALIZED spec, not just first one
    const finalizedSpec = result.data?.specs?.find(spec => spec.status === 'FINALIZED');
    const blobHash = finalizedSpec?.blobHash;
    
    if (!blobHash) {
      console.log(`[Metadata] No blob hash found for ${normalizedAddress}`);
      return null;
    }
    
    console.log(`[Metadata] Found blob hash: ${blobHash}`);
    
    // Get blob storage URLs
    const blobResponse = await fetch(`${BLOBSCAN_URL}/blobs/${blobHash}`, {
      mode: 'cors'
    });
    if (!blobResponse.ok) {
      console.log(`[Metadata] Blobscan error: ${blobResponse.status}`);
      return null;
    }
    
    const blobData = await blobResponse.json();
    const swarmUrl = blobData.dataStorageReferences?.find(ref => ref.storage === 'swarm')?.url;
    const googleUrl = blobData.dataStorageReferences?.find(ref => ref.storage === 'google')?.url;
    const storageUrl = swarmUrl || googleUrl;
    
    if (!storageUrl) {
      console.log(`[Metadata] No storage URL found for blob ${blobHash}`);
      return null;
    }
    
    console.log(`[Metadata] Fetching from storage: ${storageUrl}`);
    
    const metadataResponse = await fetch(storageUrl, {
      mode: 'cors'
    });
    if (!metadataResponse.ok) {
      console.log(`[Metadata] Storage fetch error: ${metadataResponse.status}`);
      return null;
    }
    
    // Handle blob data - it might be hex-encoded or have null bytes
    let rawData = await metadataResponse.text();
    
    // Remove null bytes if present  
    rawData = rawData.replace(/\0/g, '');
    
    // Try to parse as JSON
    let metadata;
    try {
      metadata = JSON.parse(rawData);
      console.log(`[Metadata] Successfully parsed metadata for ${normalizedAddress}`);
    } catch (parseError) {
      console.log(`[Metadata] JSON parse error:`, parseError.message);
      console.log(`[Metadata] Raw data sample:`, rawData.substring(0, 200));
      return null;
    }
    
    // Cache it
    metadataCache[cacheKey] = metadata;
    return metadata;
    
  } catch (error) {
    console.error(`[Metadata] Error fetching metadata:`, error);
    
    // If remote fetch failed and we haven't tried local yet, try local metadata as fallback
    if (!USE_LOCAL_METADATA && (error.message.includes('CSP') || error.message.includes('violates') || error.message.includes('Failed to fetch'))) {
      console.log(`[Metadata] 🔄 CSP/Network error detected, trying local metadata fallback...`);
      const localMetadata = await loadLocalMetadata(normalizedAddress, chainId);
      if (localMetadata) {
        console.log(`[Metadata] ✅ Found fallback local metadata`);
        metadataCache[cacheKey] = localMetadata;
        return localMetadata;
      }
      console.log(`[Metadata] ❌ No local fallback metadata available`);
    }
    
    return null;
  }
}

// Extract function selector
function extractFunctionSelector(data) {
  if (!data || typeof data !== 'string') return null;
  if (!data.startsWith('0x')) data = '0x' + data;
  if (data.length < 10) return null;
  return data.slice(0, 10).toLowerCase();
}

// Helper function for title case
function toTitleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Make everything available globally (SAME as Snaps repo)
window.metadataService = {
  getContractMetadata: getContractMetadata
};

window.extractFunctionSelector = extractFunctionSelector;
window.toTitleCase = toTitleCase;

console.log('[KaiSign] Metadata service ready');