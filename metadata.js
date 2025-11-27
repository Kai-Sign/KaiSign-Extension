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
const EMBEDDED_SAFE_METADATA = "ewogICIkc2NoZW1hIjogIi4uLy4uL2VyYzc3MzAtdjEuc2NoZW1hLmpzb24iLAogICJjb250ZXh0IjogewogICAgImNvbnRyYWN0IjogewogICAgICAiYWJpIjogWwogICAgICAgIHsKICAgICAgICAgICJpbnB1dHMiOiBbCiAgICAgICAgICAgIHsibmFtZSI6ICJfc2luZ2xldG9uIiwgInR5cGUiOiAiYWRkcmVzcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiaW5pdGlhbGl6ZXIiLCAidHlwZSI6ICJieXRlcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAic2FsdE5vbmNlIiwgInR5cGUiOiAidWludDI1NiJ9CiAgICAgICAgICBdLAogICAgICAgICAgIm5hbWUiOiAiY3JlYXRlUHJveHlXaXRoTm9uY2UiLAogICAgICAgICAgIm91dHB1dHMiOiBbeyJuYW1lIjogInByb3h5IiwgInR5cGUiOiAiYWRkcmVzcyJ9XSwKICAgICAgICAgICJzdGF0ZU11dGFiaWxpdHkiOiAibm9ucGF5YWJsZSIsCiAgICAgICAgICAidHlwZSI6ICJmdW5jdGlvbiIsCiAgICAgICAgICAic2VsZWN0b3IiOiAiMHgxNjg4ZjBiOSIKICAgICAgICB9LAogICAgICAgIHsKICAgICAgICAgICJpbnB1dHMiOiBbCiAgICAgICAgICAgIHsibmFtZSI6ICJfc2luZ2xldG9uIiwgInR5cGUiOiAiYWRkcmVzcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiaW5pdGlhbGl6ZXIiLCAidHlwZSI6ICJieXRlcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAic2FsdE5vbmNlIiwgInR5cGUiOiAidWludDI1NiJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiY2FsbGJhY2siLCAidHlwZSI6ICJhZGRyZXNzIn0KICAgICAgICAgIF0sCiAgICAgICAgICAibmFtZSI6ICJjcmVhdGVQcm94eVdpdGhDYWxsYmFjayIsCiAgICAgICAgICAib3V0cHV0cyI6IFt7Im5hbWUiOiAicHJveHkiLCAidHlwZSI6ICJhZGRyZXNzIn1dLAogICAgICAgICAgInN0YXRlTXV0YWJpbGl0eSI6ICJub25wYXlhYmxlIiwKICAgICAgICAgICJ0eXBlIjogImZ1bmN0aW9uIiwKICAgICAgICAgICJzZWxlY3RvciI6ICIweGQxOGFmNTRkIgogICAgICAgIH0sCiAgICAgICAgewogICAgICAgICAgImlucHV0cyI6IFsKICAgICAgICAgICAgeyJuYW1lIjogIl9zaW5nbGV0b24iLCAidHlwZSI6ICJhZGRyZXNzIn0sCiAgICAgICAgICAgIHsibmFtZSI6ICJpbml0aWFsaXplciIsICJ0eXBlIjogImJ5dGVzIn0sCiAgICAgICAgICAgIHsibmFtZSI6ICJzYWx0IiwgInR5cGUiOiAiYnl0ZXMzMiJ9CiAgICAgICAgICBdLAogICAgICAgICAgIm5hbWUiOiAiY3JlYXRlUHJveHkiLAogICAgICAgICAgIm91dHB1dHMiOiBbeyJuYW1lIjogInByb3h5IiwgInR5cGUiOiAiYWRkcmVzcyJ9XSwKICAgICAgICAgICJzdGF0ZU11dGFiaWxpdHkiOiAibm9ucGF5YWJsZSIsCiAgICAgICAgICAidHlwZSI6ICJmdW5jdGlvbiIsCiAgICAgICAgICAic2VsZWN0b3IiOiAiMHg0ZjkyN2M5MyIKICAgICAgICB9LAogICAgICAgIHsKICAgICAgICAgICJpbnB1dHMiOiBbCiAgICAgICAgICAgIHsibmFtZSI6ICJfc2luZ2xldG9uIiwgInR5cGUiOiAiYWRkcmVzcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAiaW5pdGlhbGl6ZXIiLCAidHlwZSI6ICJieXRlcyJ9LAogICAgICAgICAgICB7Im5hbWUiOiAic2FsdE5vbmNlIiwgInR5cGUiOiAidWludDI1NiJ9CiAgICAgICAgICBdLAogICAgICAgICAgIm5hbWUiOiAiY2FsY3VsYXRlQ3JlYXRlUHJveHlXaXRoTm9uY2VBZGRyZXNzIiwKICAgICAgICAgICJvdXRwdXRzIjogW3sibmFtZSI6ICJwcm94eSIsICJ0eXBlIjogImFkZHJlc3MifV0sCiAgICAgICAgICAic3RhdGVNdXRhYmlsaXR5IjogInZpZXciLAogICAgICAgICAgInR5cGUiOiAiZnVuY3Rpb24iLAogICAgICAgICAgInNlbGVjdG9yIjogIjB4MjUwMDUxMGUiCiAgICAgICAgfQogICAgICBdLAogICAgICAiZGVwbG95bWVudHMiOiB7CiAgICAgICAgIm1haW5uZXQiOiB7CiAgICAgICAgICAiYWRkcmVzcyI6ICIweDRlMWRjZjdhZDRlNDYwY2ZkMzA3OTFjY2M0ZjljOGE0ZjgyMGVjNjciLAogICAgICAgICAgImNoYWluSWQiOiAxCiAgICAgICAgfSwKICAgICAgICAic2Vwb2xpYSI6IHsKICAgICAgICAgICJhZGRyZXNzIjogIjB4NGUxZGNmN2FkNGU0NjBjZmQzMDc5MWNjYzRmOWM4YTRmODIwZWM2NyIsCiAgICAgICAgICAiY2hhaW5JZCI6IDExMTU1MTExCiAgICAgICAgfSwKICAgICAgICAicG9seWdvbiI6IHsKICAgICAgICAgICJhZGRyZXNzIjogIjB4NGUxZGNmN2FkNGU0NjBjZmQzMDc5MWNjYzRmOWM4YTRmODIwZWM2NyIsCiAgICAgICAgICAiY2hhaW5JZCI6IDEzNwogICAgICAgIH0KICAgICAgfQogICAgfQogIH0sCiAgIm1ldGFkYXRhIjogewogICAgIm93bmVyIjogIlNhZmUgRWNvc3lzdGVtIEZvdW5kYXRpb24iLAogICAgImluZm8iOiB7CiAgICAgICJ1cmwiOiAiaHR0cHM6Ly9zYWZlLmdsb2JhbCIsCiAgICAgICJsZWdhbE5hbWUiOiAiU2FmZSBFY29zeXN0ZW0gRm91bmRhdGlvbiIsCiAgICAgICJsYXN0VXBkYXRlIjogIjIwMjQtMTEtMjciCiAgICB9LAogICAgInRva2VuIjogewogICAgICAic3RhbmRhcmQiOiAibm9uZSIKICAgIH0KICB9LAogICJkaXNwbGF5IjogewogICAgImZvcm1hdHMiOiB7CiAgICAgICJjcmVhdGVQcm94eVdpdGhOb25jZSI6IHsKICAgICAgICAiaW50ZW50IjogewogICAgICAgICAgInR5cGUiOiAiY2FsbGRhdGEiLAogICAgICAgICAgImZvcm1hdCI6IFsKICAgICAgICAgICAgewogICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAiZGlyZWN0aW9uIjogImNvbHVtbiIsCiAgICAgICAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAidGV4dCIsCiAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiaGVhZGluZzIiLAogICAgICAgICAgICAgICAgICAidmFsdWUiOiAi8J+PrSBDcmVhdGUgU2FmZSBXYWxsZXQiCiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAidHlwZSI6ICJjb250YWluZXIiLAogICAgICAgICAgICAgICAgICAibGF5b3V0IjogImZsZXgiLAogICAgICAgICAgICAgICAgICAiZGlyZWN0aW9uIjogInJvdyIsCiAgICAgICAgICAgICAgICAgICJmaWVsZHMiOiBbCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAgInR5cGUiOiAidGV4dCIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImJvbGQiLAogICAgICAgICAgICAgICAgICAgICAgInZhbHVlIjogIlNhZmUgSW1wbGVtZW50YXRpb246IgogICAgICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAgInR5cGUiOiAiYWRkcmVzcyIsCiAgICAgICAgICAgICAgICAgICAgICAicGF0aCI6ICJfc2luZ2xldG9uIiwKICAgICAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiYWRkcmVzc05hbWUiCiAgICAgICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgICAgICBdCiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAidHlwZSI6ICJjb250YWluZXIiLAogICAgICAgICAgICAgICAgICAibGF5b3V0IjogImZsZXgiLAogICAgICAgICAgICAgICAgICAiZGlyZWN0aW9uIjogInJvdyIsCiAgICAgICAgICAgICAgICAgICJmaWVsZHMiOiBbCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAgInR5cGUiOiAidGV4dCIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImJvbGQiLAogICAgICAgICAgICAgICAgICAgICAgInZhbHVlIjogIlNhbHQgTm9uY2U6IgogICAgICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAgInR5cGUiOiAiYW1vdW50IiwKICAgICAgICAgICAgICAgICAgICAgICJwYXRoIjogInNhbHROb25jZSIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogInVuaXQiCiAgICAgICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgICAgICBdCiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAidHlwZSI6ICJjb250YWluZXIiLAogICAgICAgICAgICAgICAgICAibGF5b3V0IjogImZsZXgiLAogICAgICAgICAgICAgICAgICAiZGlyZWN0aW9uIjogImNvbHVtbiIsCiAgICAgICAgICAgICAgICAgICJmaWVsZHMiOiBbCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAgInR5cGUiOiAidGV4dCIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImJvbGQiLAogICAgICAgICAgICAgICAgICAgICAgInZhbHVlIjogIkluaXRpYWxpemF0aW9uIERhdGE6IgogICAgICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY2FsbGRhdGEiLAogICAgICAgICAgICAgICAgICAgICAgInBhdGgiOiAiaW5pdGlhbGl6ZXIiLAogICAgICAgICAgICAgICAgICAgICAgInRvIjogIiQuX3NpbmdsZXRvbiIKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgIF0KICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICBdCiAgICAgICAgICAgIH0KICAgICAgICAgIF0KICAgICAgICB9CiAgICAgIH0sCiAgICAgICJjcmVhdGVQcm94eVdpdGhDYWxsYmFjayI6IHsKICAgICAgICAiaW50ZW50IjogewogICAgICAgICAgInR5cGUiOiAiY2FsbGRhdGEiLAogICAgICAgICAgImZvcm1hdCI6IFsKICAgICAgICAgICAgewogICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAiZGlyZWN0aW9uIjogImNvbHVtbiIsCiAgICAgICAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAidGV4dCIsCiAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiaGVhZGluZzIiLAogICAgICAgICAgICAgICAgICAidmFsdWUiOiAi8J+PrSBDcmVhdGUgU2FmZSBXYWxsZXQgd2l0aCBDYWxsYmFjayIKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgICAgICJsYXlvdXQiOiAiZmxleCIsCiAgICAgICAgICAgICAgICAgICJkaXJlY3Rpb24iOiAicm93IiwKICAgICAgICAgICAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAidHlwZSI6ICJ0ZXh0IiwKICAgICAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiYm9sZCIsCiAgICAgICAgICAgICAgICAgICAgICAidmFsdWUiOiAiU2FmZSBJbXBsZW1lbnRhdGlvbjoiCiAgICAgICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAidHlwZSI6ICJhZGRyZXNzIiwKICAgICAgICAgICAgICAgICAgICAgICJwYXRoIjogIl9zaW5nbGV0b24iLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJhZGRyZXNzTmFtZSIKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgIF0KICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgICAgICJsYXlvdXQiOiAiZmxleCIsCiAgICAgICAgICAgICAgICAgICJkaXJlY3Rpb24iOiAicm93IiwKICAgICAgICAgICAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAidHlwZSI6ICJ0ZXh0IiwKICAgICAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiYm9sZCIsCiAgICAgICAgICAgICAgICAgICAgICAidmFsdWUiOiAiU2FsdCBOb25jZToiCiAgICAgICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAidHlwZSI6ICJhbW91bnQiLAogICAgICAgICAgICAgICAgICAgICAgInBhdGgiOiAic2FsdE5vbmNlIiwKICAgICAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAidW5pdCIKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgIF0KICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgICAgICJsYXlvdXQiOiAiZmxleCIsCiAgICAgICAgICAgICAgICAgICJkaXJlY3Rpb24iOiAicm93IiwKICAgICAgICAgICAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAidHlwZSI6ICJ0ZXh0IiwKICAgICAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiYm9sZCIsCiAgICAgICAgICAgICAgICAgICAgICAidmFsdWUiOiAiQ2FsbGJhY2sgQ29udHJhY3Q6IgogICAgICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAgInR5cGUiOiAiYWRkcmVzcyIsCiAgICAgICAgICAgICAgICAgICAgICAicGF0aCI6ICJjYWxsYmFjayIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImFkZHJlc3NOYW1lIgogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgXQogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJjb2x1bW4iLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJJbml0aWFsaXphdGlvbiBEYXRhOiIKICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogImNhbGxkYXRhIiwKICAgICAgICAgICAgICAgICAgICAgICJwYXRoIjogImluaXRpYWxpemVyIiwKICAgICAgICAgICAgICAgICAgICAgICJ0byI6ICIkLl9zaW5nbGV0b24iCiAgICAgICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgICAgICBdCiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgXQogICAgICAgICAgICB9CiAgICAgICAgICBdCiAgICAgICAgfQogICAgICB9LAogICAgICAiY3JlYXRlUHJveHkiOiB7CiAgICAgICAgImludGVudCI6IHsKICAgICAgICAgICJ0eXBlIjogImNhbGxkYXRhIiwKICAgICAgICAgICJmb3JtYXQiOiBbCiAgICAgICAgICAgIHsKICAgICAgICAgICAgICAidHlwZSI6ICJjb250YWluZXIiLAogICAgICAgICAgICAgICJsYXlvdXQiOiAiZmxleCIsCiAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJjb2x1bW4iLAogICAgICAgICAgICAgICJmaWVsZHMiOiBbCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImhlYWRpbmcyIiwKICAgICAgICAgICAgICAgICAgInZhbHVlIjogIvCfj60gQ3JlYXRlIFNhZmUgV2FsbGV0IFByb3h5IgogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJyb3ciLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJTYWZlIEltcGxlbWVudGF0aW9uOiIKICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogImFkZHJlc3MiLAogICAgICAgICAgICAgICAgICAgICAgInBhdGgiOiAiX3NpbmdsZXRvbiIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImFkZHJlc3NOYW1lIgogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgXQogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgInR5cGUiOiAiY29udGFpbmVyIiwKICAgICAgICAgICAgICAgICAgImxheW91dCI6ICJmbGV4IiwKICAgICAgICAgICAgICAgICAgImRpcmVjdGlvbiI6ICJyb3ciLAogICAgICAgICAgICAgICAgICAiZmllbGRzIjogWwogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgImZvcm1hdCI6ICJib2xkIiwKICAgICAgICAgICAgICAgICAgICAgICJ2YWx1ZSI6ICJTYWx0OiIKICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICAgICJ0eXBlIjogInRleHQiLAogICAgICAgICAgICAgICAgICAgICAgInBhdGgiOiAic2FsdCIsCiAgICAgICAgICAgICAgICAgICAgICAiZm9ybWF0IjogImhleCIKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgIF0KICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICJ0eXBlIjogImNvbnRhaW5lciIsCiAgICAgICAgICAgICAgICAgICJsYXlvdXQiOiAiZmxleCIsCiAgICAgICAgICAgICAgICAgICJkaXJlY3Rpb24iOiAiY29sdW1uIiwKICAgICAgICAgICAgICAgICAgImZpZWxkcyI6IFsKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAidHlwZSI6ICJ0ZXh0IiwKICAgICAgICAgICAgICAgICAgICAgICJmb3JtYXQiOiAiYm9sZCIsCiAgICAgICAgICAgICAgICAgICAgICAidmFsdWUiOiAiSW5pdGlhbGl6YXRpb24gRGF0YToiCiAgICAgICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAidHlwZSI6ICJjYWxsZGF0YSIsCiAgICAgICAgICAgICAgICAgICAgICAicGF0aCI6ICJpbml0aWFsaXplciIsCiAgICAgICAgICAgICAgICAgICAgICAidG8iOiAiJC5fc2luZ2xldG9uIgogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgXQogICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgIF0KICAgICAgICAgICAgfQogICAgICAgICAgXQogICAgICAgIH0KICAgICAgfQogICAgfQogIH0KfQ==";

// Local metadata contract mapping (when USE_LOCAL_METADATA = true)
const LOCAL_CONTRACT_METADATA = {
  // KaiSign contracts
  '0x4dfea0c2b472a14cd052a8f9df9f19fa5cf03719': 'local-poap.json', // Use actual copied file
  
  // Universal Router (from your transaction)
  '0x66a9893cc07d91d95644aedd05d03f95e1dba8af': 'uniswap-v4/universal-router/v4-swap.json',
  // Universal Router V2 (Real transactions)
  '0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b': 'uniswap-v3/universal-router-v2/metadata.json',
  '0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B': 'uniswap-v3/universal-router-v2/metadata.json', // With proper case
  '0x3bfa4769fb09eefc5a80d6e87c3b9c650f7bb016': 'uniswap-v3/universal-router-v2/metadata.json', // Sepolia
  '0x4c60051384bd2d3c01f297062cdc2fc0d91d8c18': 'uniswap-v3/universal-router-v2/metadata.json', // Polygon
  
  // Uniswap V4 contracts
  '0x000000000004444c5dc75cb358380d2e3de08a90': 'uniswap-v4/pool-manager/metadata.json',
  '0x1f98400000000000000000000000000000000004': 'uniswap-v4/pool-manager/metadata.json',
  '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3': 'uniswap-v4/pool-manager/metadata.json',
  '0x498581ff718922c3f8e6a244956af099b2652b2b': 'uniswap-v4/pool-manager/metadata.json',
  '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e': 'uniswap-v4/position-manager/metadata.json',
  '0x3d4e44eb1374240ce5f1b871ab261cd16335b76a': 'uniswap-v4/quoter/metadata.json',
  '0x2e234dae75c793f67a35089c9d99245e1c58470b': 'uniswap-v4/state-view/metadata.json',
  
  // ERC-20 Tokens (all from Snaps)
  '0xa0b86a33e6fe4c6b25e6e6f24a7d7a72d9f2e3c6': 'tokens/usdc.json',
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'tokens/dai.json',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'tokens/usdc.json', // USDC from your transaction
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'tokens/usdt.json',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'tokens/usdc.json', // WETH fallback to USDC format
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': 'tokens/aave.json',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'tokens/btc.json',
  '0xc00e94cb662c3520282e6f5717214004a7f26888': 'tokens/comp.json',
  '0xd533a949740bb3306d119cc777fa900ba034cd52': 'tokens/crv.json',
  '0x5a98fecbea516cf06857215779fd812ca3bef1b3': 'tokens/ldo.json',
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'tokens/link.json',
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0': 'tokens/matic.json',
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': 'tokens/mkr.json',
  '0x4200000000000000000000000000000000000042': 'tokens/op.json',
  '0x6982508145454ce325ddbe47a25d4ec3d2311933': 'tokens/pepe.json',
  '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce': 'tokens/shib.json',
  '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': 'tokens/snx.json',
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'tokens/uni.json',
  
  // 1inch Aggregation Router
  '0x1111111254eeb25477b68fb85ed929f73a960582': 'common-AggregationRouterV6.json',
  
  // POAP Bridge
  '0xa4e7b93bb9e9ed78046e3bb6d33e2d9b8bf86e1f': 'poap/poap-bridge/metadata.json',
  
  // Safe Contracts
  '0x41675c099f32341bf84bfc5382af534df5c7461a': 'safe/safe-singleton/metadata.json',
  '0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67': 'safe-proxy-factory-test.json',
  '0x4E1DCf7ad4E460CfD30791CCc4F9c8A4f820eC67': 'safe-proxy-factory-test.json', // Case variant
  '0x40a2accbd92bca938b02010e17a5b8929b49130d': 'safe/multi-send/metadata.json',
  '0x7cbB62EaA69F79e6873cD1ecB2392971036cFdA4': 'safe/create-call/metadata.json',
  
  // AAVE Governance 
  '0xEC568fffba86c094cf06b22134B23074DFE2252c': 'aave/governance-v2/metadata.json',
  '0x401b5d0294e23637c18fcc38b1bca814cda2637c': 'aave/governance-v2/metadata.json' // Polygon
};

console.log(`[Metadata] Source mode: ${USE_LOCAL_METADATA ? 'LOCAL' : 'REMOTE (subgraph+blobs)'}`);
if (USE_LOCAL_METADATA) {
  console.log(`[Metadata] Local contracts mapped: ${Object.keys(LOCAL_CONTRACT_METADATA).length}`);
}

// Metadata cache
const metadataCache = {};

// =============================================================================
// LOCAL METADATA LOADING FUNCTIONS
// =============================================================================

async function loadLocalMetadata(contractAddress, chainId) {
  try {
    console.log(`[Metadata] LOADING - Contract: ${contractAddress}`);
    console.log(`[Metadata] LOADING - Available mappings:`, Object.keys(LOCAL_CONTRACT_METADATA));
    
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
    
    const metadataFile = LOCAL_CONTRACT_METADATA[contractAddress];
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
    contractsMapped: Object.keys(LOCAL_CONTRACT_METADATA).length,
    cache: Object.keys(metadataCache).length
  };
};

// Expose contract mapping for testing
window.LOCAL_CONTRACT_METADATA = LOCAL_CONTRACT_METADATA;
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
  console.log(`[Metadata] CONTRACT MAPPING CHECK:`, !!LOCAL_CONTRACT_METADATA[normalizedAddress]);
  console.log(`[Metadata] ALL AVAILABLE CONTRACTS:`, Object.keys(LOCAL_CONTRACT_METADATA));
  
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