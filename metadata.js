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

// Embedded Safe Singleton metadata (base64 encoded) - for execTransaction proxy detection
const EMBEDDED_SAFE_SINGLETON_METADATA = "ewogICIkc2NoZW1hIjogIi4uLy4uL2VyYzc3MzAtdjEuc2NoZW1hLmpzb24iLAogICJjb250ZXh0IjogewogICAgImNvbnRyYWN0IjogewogICAgICAiYWJpIjogWwogICAgICAgIHsKICAgICAgICAgICJpbnB1dHMiOiBbCiAgICAgICAgICAgIHsibmFtZSI6ICJ0byIsICJ0eXBlIjogImFkZHJlc3MifSwKICAgICAgICAgICAgeyJuYW1lIjogInZhbHVlIiwgInR5cGUiOiAidWludDI1NiJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiZGF0YSIsICJ0eXBlIjogImJ5dGVzIn0sCiAgICAgICAgICAgIHsibmFtZSI6ICJvcGVyYXRpb24iLCAidHlwZSI6ICJ1aW50OCJ9LAogICAgICAgICAgICB7Im5hbWUiOiAic2FmZVR4R2FzIiwgInR5cGUiOiAidWludDI1NiJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiYmFzZUdhcyIsICJ0eXBlIjogInVpbnQyNTYifSwKICAgICAgICAgICAgeyJuYW1lIjogImdhc1ByaWNlIiwgInR5cGUiOiAidWludDI1NiJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiZ2FzVG9rZW4iLCAidHlwZSI6ICJhZGRyZXNzIn0sCiAgICAgICAgICAgIHsibmFtZSI6ICJyZWZ1bmRSZWNlaXZlciIsICJ0eXBlIjogImFkZHJlc3MifSwKICAgICAgICAgICAgeyJuYW1lIjogInNpZ25hdHVyZXMiLCAidHlwZSI6ICJieXRlcyJ9CiAgICAgICAgICBdLAogICAgICAgICAgIm5hbWUiOiAiZXhlY1RyYW5zYWN0aW9uIiwKICAgICAgICAgICJvdXRwdXRzIjogW3sibmFtZSI6ICJzdWNjZXNzIiwgInR5cGUiOiAiYm9vbCJ9XSwKICAgICAgICAgICJzdGF0ZU11dGFiaWxpdHkiOiAicGF5YWJsZSIsCiAgICAgICAgICAidHlwZSI6ICJmdW5jdGlvbiIsCiAgICAgICAgICAic2VsZWN0b3IiOiAiMHg2YTc2MTIwMiIKICAgICAgICB9CiAgICAgIF0KICAgIH0KICB9LAogICJtZXRhZGF0YSI6IHsKICAgICJvd25lciI6ICJTYWZlIEVjb3N5c3RlbSBGb3VuZGF0aW9uIgogIH0sCiAgImRpc3BsYXkiOiB7CiAgICAiZm9ybWF0cyI6IHsKICAgICAgImV4ZWNUcmFuc2FjdGlvbiI6IHsKICAgICAgICAiaW50ZW50IjogewogICAgICAgICAgInR5cGUiOiAiY2FsbGRhdGEiLAogICAgICAgICAgImZvcm1hdCI6IFsKICAgICAgICAgICAgewogICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAiZGlyZWN0aW9uIjogImNvbHVtbiIsCiAgICAgICAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAidGV4dCIsCiAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiaGVhZGluZzIiLAogICAgICAgICAgICAgICAgICAidmFsdWUiOiAiU2FmZSBNdWx0aS1TaWduYXR1cmUgVHJhbnNhY3Rpb24iCiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAidHlwZSI6ICJhZGRyZXNzIiwKICAgICAgICAgICAgICAgICAgInBhdGgiOiAidG8iLAogICAgICAgICAgICAgICAgICAibGFiZWwiOiAiVGFyZ2V0IiwKICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJhZGRyZXNzTmFtZSIKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICJ0eXBlIjogImFtb3VudCIsCiAgICAgICAgICAgICAgICAgICJwYXRoIjogInZhbHVlIiwKICAgICAgICAgICAgICAgICAgImxhYmVsIjogIlZhbHVlIiwKICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJldGhlciIKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICJ0eXBlIjogImNhbGxkYXRhIiwKICAgICAgICAgICAgICAgICAgInBhdGgiOiAiZGF0YSIsCiAgICAgICAgICAgICAgICAgICJ0byI6ICIkLnRvIgogICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgIF0KICAgICAgICAgICAgfQogICAgICAgICAgXQogICAgICAgIH0sCiAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgIHsKICAgICAgICAgICAgInBhdGgiOiAidG8iLAogICAgICAgICAgICAibGFiZWwiOiAiVGFyZ2V0IiwKICAgICAgICAgICAgImZvcm1hdCI6ICJhZGRyZXNzTmFtZSIKICAgICAgICAgIH0sCiAgICAgICAgICB7CiAgICAgICAgICAgICJwYXRoIjogInZhbHVlIiwKICAgICAgICAgICAgImxhYmVsIjogIlZhbHVlIiwKICAgICAgICAgICAgImZvcm1hdCI6ICJldGhlciIKICAgICAgICAgIH0sCiAgICAgICAgICB7CiAgICAgICAgICAgICJwYXRoIjogImRhdGEiLAogICAgICAgICAgICAibGFiZWwiOiAiRGF0YSIsCiAgICAgICAgICAgICJ0eXBlIjogImNhbGxkYXRhIiwKICAgICAgICAgICAgInRvIjogIiQudG8iCiAgICAgICAgICB9LAogICAgICAgICAgewogICAgICAgICAgICAicGF0aCI6ICJvcGVyYXRpb24iLAogICAgICAgICAgICAibGFiZWwiOiAiT3BlcmF0aW9uIFR5cGUiLAogICAgICAgICAgICAiZm9ybWF0IjogImVudW0iLAogICAgICAgICAgICAib3B0aW9ucyI6IHsKICAgICAgICAgICAgICAiMCI6ICJDYWxsIiwKICAgICAgICAgICAgICAiMSI6ICJEZWxlZ2F0ZUNhbGwiCiAgICAgICAgICAgIH0KICAgICAgICAgIH0KICAgICAgICBdCiAgICAgIH0KICAgIH0KICB9Cn0=";

// Embedded Safe MultiSend metadata (direct JSON for content-script.js access)
const EMBEDDED_SAFE_MULTISEND_METADATA = {
  "context": {
    "contract": {
      "abi": [
        {
          "type": "function",
          "name": "multiSend",
          "selector": "0x8d80ff0a",
          "inputs": [
            { "name": "transactions", "type": "bytes" }
          ]
        }
      ]
    }
  },
  "parsing": {
    "multiSendStructure": {
      "fields": [
        { "name": "operation", "type": "uint8", "size": 1 },
        { "name": "to", "type": "address", "size": 20 },
        { "name": "value", "type": "uint256", "size": 32 },
        { "name": "dataLength", "type": "uint256", "size": 32 },
        { "name": "data", "type": "bytes", "sizeField": "dataLength" }
      ]
    },
    "operationTypes": {
      "0": { "name": "CALL", "color": "#68d391", "description": "Regular call" },
      "1": { "name": "DELEGATECALL", "color": "#ff6b6b", "description": "Delegate call" }
    }
  },
  "eip712": {
    "SafeTx": [
      { "name": "to", "type": "address" },
      { "name": "value", "type": "uint256" },
      { "name": "data", "type": "bytes" },
      { "name": "operation", "type": "uint8" },
      { "name": "safeTxGas", "type": "uint256" },
      { "name": "baseGas", "type": "uint256" },
      { "name": "gasPrice", "type": "uint256" },
      { "name": "gasToken", "type": "address" },
      { "name": "refundReceiver", "type": "address" },
      { "name": "nonce", "type": "uint256" }
    ]
  },
  "detection": {
    "typedDataTypes": ["SafeTx", "SafeMessage"],
    "domPatterns": ["Primary type: SafeTx", "Primary type: SafeMessage"]
  },
  "display": {
    "formats": {
      "multiSend(bytes)": {
        "intent": "Execute Multiple Transactions (Safe Batch)",
        "fields": [
          { "path": "transactions", "label": "Batch Transactions", "format": "multiSendBatch" }
        ]
      }
    }
  }
};

// Expose embedded batch transaction metadata globally for content-script.js
// Generic name - not protocol-specific
window.batchTransactionMetadata = EMBEDDED_SAFE_MULTISEND_METADATA;
window.multisendMetadata = EMBEDDED_SAFE_MULTISEND_METADATA;

// =============================================================================
// PROTOCOL METADATA - Categories, Safe Detection, Safe UI, Universal Router
// =============================================================================

// Protocol metadata storage
const protocolMetadata = {
  categories: null,
  safeDetection: null,
  safeUi: null,
  universalRouter: null
};

// Load protocol metadata files
async function loadProtocolMetadata() {
  console.log('[Metadata] Loading protocol metadata files...');

  try {
    // Determine base path for metadata files
    let basePath = LOCAL_METADATA_PATH;

    // If chrome.runtime is available, use extension URL
    if (window.chrome?.runtime?.getURL) {
      try {
        basePath = window.chrome.runtime.getURL(LOCAL_METADATA_PATH);
      } catch (e) {
        console.log('[Metadata] Using relative path for protocol metadata');
      }
    }

    // Load all protocol metadata files in parallel
    const [categoriesRes, safeDetectionRes, safeUiRes, universalRouterRes] = await Promise.allSettled([
      fetch(`${basePath}/protocols/categories.json`).then(r => r.ok ? r.json() : null),
      fetch(`${basePath}/safe/safe-detection.json`).then(r => r.ok ? r.json() : null),
      fetch(`${basePath}/safe/safe-ui.json`).then(r => r.ok ? r.json() : null),
      fetch(`${basePath}/uniswap/universal-router.json`).then(r => r.ok ? r.json() : null)
    ]);

    // Store loaded metadata
    if (categoriesRes.status === 'fulfilled' && categoriesRes.value) {
      protocolMetadata.categories = categoriesRes.value;
      console.log('[Metadata] Loaded categories.json');
    }

    if (safeDetectionRes.status === 'fulfilled' && safeDetectionRes.value) {
      protocolMetadata.safeDetection = safeDetectionRes.value;
      console.log('[Metadata] Loaded safe-detection.json');
    }

    if (safeUiRes.status === 'fulfilled' && safeUiRes.value) {
      protocolMetadata.safeUi = safeUiRes.value;
      console.log('[Metadata] Loaded safe-ui.json');
    }

    if (universalRouterRes.status === 'fulfilled' && universalRouterRes.value) {
      protocolMetadata.universalRouter = universalRouterRes.value;
      console.log('[Metadata] Loaded universal-router.json');
    }

    console.log('[Metadata] Protocol metadata loading complete');

  } catch (error) {
    console.error('[Metadata] Error loading protocol metadata:', error);
  }
}

// Get category info by name (checks aliases)
function getCategoryInfo(categoryName) {
  const categories = protocolMetadata.categories?.categories;
  if (!categories) return null;

  // Direct match first
  if (categories[categoryName]) {
    return categories[categoryName];
  }

  // Check aliases
  for (const [key, category] of Object.entries(categories)) {
    if (category.aliases?.includes(categoryName)) {
      return category;
    }
  }

  return null;
}

// Get all aliases for a category
function getCategoryAliases(categoryName) {
  const categoryInfo = getCategoryInfo(categoryName);
  return categoryInfo?.aliases || [categoryName];
}

// Check if a category matches any of the given names
function categoryMatches(category, names) {
  if (!Array.isArray(names)) names = [names];
  const aliases = getCategoryAliases(category);
  return names.some(n => aliases.includes(n) || category === n);
}

// Format intent using category template
function formatCategoryIntent(categoryName, params = {}) {
  const categoryInfo = getCategoryInfo(categoryName);
  if (!categoryInfo?.intentTemplate) {
    return categoryInfo?.fallbackIntent || categoryName;
  }

  let intent = categoryInfo.intentTemplate;
  for (const [key, value] of Object.entries(params)) {
    intent = intent.replace(`{${key}}`, value);
  }
  return intent;
}

// Get Safe detection config
function getSafeDetectionConfig() {
  return protocolMetadata.safeDetection || {
    hostnames: [],
    hostnamePatterns: [],
    domSelectors: {},
    buttonTextPatterns: [],
    dataPatterns: {},
    safeEvents: [],
    safeGlobals: []
  };
}

// Get Safe UI config
function getSafeUiConfig() {
  return protocolMetadata.safeUi || {
    notifications: {},
    styles: {},
    colors: {},
    labels: {}
  };
}

// Get Universal Router parsing config
function getUniversalRouterConfig() {
  return protocolMetadata.universalRouter || {
    parsing: {},
    fallbacks: {},
    resultTypes: {}
  };
}

// Extract data using offset config from metadata
function extractDataWithOffset(data, offsetConfig) {
  if (!offsetConfig || !data) return null;
  const start = offsetConfig.start || 0;
  const end = offsetConfig.end || data.length;
  const prefix = offsetConfig.prefix || '';
  return prefix + data.slice(start, end);
}

// Expose protocol metadata globally
window.protocolMetadata = protocolMetadata;
window.getCategoryInfo = getCategoryInfo;
window.getCategoryAliases = getCategoryAliases;
window.categoryMatches = categoryMatches;
window.formatCategoryIntent = formatCategoryIntent;
window.getSafeDetectionConfig = getSafeDetectionConfig;
window.getSafeUiConfig = getSafeUiConfig;
window.getUniversalRouterConfig = getUniversalRouterConfig;
window.extractDataWithOffset = extractDataWithOffset;

// Load protocol metadata on startup
loadProtocolMetadata();

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

/**
 * Load metadata file from local-metadata directory
 * @param {string} relativePath - Path relative to LOCAL_METADATA_PATH (e.g., "aave/pool-v3/metadata.json")
 * @returns {object|null} - Parsed metadata or null
 */
async function loadMetadataFile(relativePath) {
  try {
    // Try using chrome.runtime.getURL for extension context
    let basePath = LOCAL_METADATA_PATH;
    if (window.chrome?.runtime?.getURL) {
      try {
        basePath = window.chrome.runtime.getURL(LOCAL_METADATA_PATH);
      } catch (e) {
        console.log('[Metadata] Using relative path');
      }
    }

    const fullPath = `${basePath}/${relativePath}`;
    console.log(`[Metadata] Fetching: ${fullPath}`);

    const response = await fetch(fullPath);
    if (!response.ok) {
      console.warn(`[Metadata] Failed to fetch ${fullPath}: ${response.status}`);
      return null;
    }

    const metadata = await response.json();
    console.log(`[Metadata] ✅ Loaded: ${relativePath}`);
    return metadata;
  } catch (error) {
    console.warn(`[Metadata] Error loading ${relativePath}:`, error.message);
    return null;
  }
}

async function loadLocalMetadata(contractAddress, chainId, selector = null) {
  try {
    const normalizedAddress = contractAddress.toLowerCase();

    // SELECTOR-BASED DETECTION for contracts that use proxy patterns (like Safe)
    // Any contract calling execTransaction (0x6a761202) is a Safe proxy
    if (selector === '0x6a761202') {
      try {
        return JSON.parse(atob(EMBEDDED_SAFE_SINGLETON_METADATA));
      } catch (e) {
        // Silent fail - will fall through to other lookups
      }
    }

    // Check embedded metadata first (Safe, Permit2, Universal Router, MultiSend)
    if (normalizedAddress === '0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67') {
      try { return JSON.parse(atob(EMBEDDED_SAFE_METADATA)); } catch {}
    }
    if (normalizedAddress === '0x000000000022d473030f116ddee9f6b43ac78ba3') {
      try { return JSON.parse(atob(EMBEDDED_PERMIT2_METADATA)); } catch {}
    }
    if (normalizedAddress === '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad' || normalizedAddress === '0x66a9893cc07d91d95644aedd05d03f95e1dba8af') {
      try { return JSON.parse(atob(EMBEDDED_UNIVERSAL_ROUTER_METADATA)); } catch {}
    }

    // MultiSend contracts
    const multiSendAddresses = [
      '0x9641d764fc13c8b624c04430c7356c1c7c8102e2',
      '0x40a2accbd92bca938b02010e17a5b8929b49130d',
      '0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761',
      '0x38869bf66a61cf6bdb996a6ae40d5853fd43b526'
    ];
    if (multiSendAddresses.includes(normalizedAddress)) {
      return EMBEDDED_SAFE_MULTISEND_METADATA;
    }

    // Safe Singleton addresses
    const safeSingletonAddresses = [
      '0xd9db270c1b5e3bd161e8c8503c55ceabee709552',
      '0x41675c099f32341bf84bfc5382af534df5c7461a',
      '0x29fcb43b46531bca003ddc8fcb67ffe91900c762'
    ];
    if (safeSingletonAddresses.includes(normalizedAddress)) {
      return await loadMetadataFile('safe/safe-singleton/metadata.json');
    }

    // Aave V3 Pool
    if (normalizedAddress === '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2') {
      return await loadMetadataFile('aave/pool-v3/metadata.json');
    }

    const metadataFile = getContractMetadataPath(contractAddress);
    if (!metadataFile) return null;

    const filePath = `${LOCAL_METADATA_PATH}/${metadataFile}`;

    try {
      // Try to construct extension URL
      let extensionUrl = null;
      const extensionScripts = Array.from(document.querySelectorAll('script[src]')).filter(s => s.src.includes('chrome-extension://'));

      if (extensionScripts.length > 0) {
        const extensionId = extensionScripts[0].src.match(/chrome-extension:\/\/([a-z]+)\//)?.[1];
        if (extensionId) extensionUrl = `chrome-extension://${extensionId}/${filePath}`;
      } else if (window.chrome?.runtime?.id) {
        extensionUrl = `chrome-extension://${window.chrome.runtime.id}/${filePath}`;
      } else if (window.chrome?.runtime?.getURL) {
        try { extensionUrl = window.chrome.runtime.getURL(filePath); } catch {}
      }

      const response = await fetch(extensionUrl || filePath);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  } catch {
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
// selector parameter allows detecting proxy contracts by their function selector
async function getContractMetadata(contractAddress, chainId, selector = null) {
  const normalizedAddress = contractAddress.toLowerCase();
  // Include selector in cache key for proxy detection
  const cacheKey = selector ? `${normalizedAddress}-${chainId}-${selector}` : `${normalizedAddress}-${chainId}`;

  if (metadataCache[cacheKey]) {
    return metadataCache[cacheKey];
  }

  // LOCAL METADATA MODE
  if (USE_LOCAL_METADATA) {
    const localMetadata = await loadLocalMetadata(normalizedAddress, chainId, selector);
    if (localMetadata) {
      metadataCache[cacheKey] = localMetadata;
      return localMetadata;
    }
  }

  try {
    
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

// Metadata service ready