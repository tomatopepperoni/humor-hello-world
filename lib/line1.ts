/**
 * The 1 train, South Ferry → 116 St–Columbia University (local stops), with
 * approximate station coordinates for the 3D map. Shared by server and client.
 */
export const LINE_1 = [
  { name: "South Ferry", lat: 40.7019, lng: -74.013 },
  { name: "Rector St", lat: 40.7077, lng: -74.0137 },
  { name: "WTC Cortlandt", lat: 40.7115, lng: -74.0123 },
  { name: "Chambers St", lat: 40.7154, lng: -74.0091 },
  { name: "Franklin St", lat: 40.7192, lng: -74.0068 },
  { name: "Canal St", lat: 40.7223, lng: -74.0061 },
  { name: "Houston St", lat: 40.7283, lng: -74.0053 },
  { name: "Christopher St–Stonewall", lat: 40.7334, lng: -74.0029 },
  { name: "14 St", lat: 40.7377, lng: -74.0001 },
  { name: "18 St", lat: 40.741, lng: -73.9978 },
  { name: "23 St", lat: 40.7441, lng: -73.9956 },
  { name: "28 St", lat: 40.747, lng: -73.9934 },
  { name: "34 St–Penn Station", lat: 40.7502, lng: -73.9911 },
  { name: "Times Sq–42 St", lat: 40.7553, lng: -73.9873 },
  { name: "50 St", lat: 40.7617, lng: -73.9838 },
  { name: "59 St–Columbus Circle", lat: 40.7682, lng: -73.9819 },
  { name: "66 St–Lincoln Center", lat: 40.7735, lng: -73.9822 },
  { name: "72 St", lat: 40.7784, lng: -73.9817 },
  { name: "79 St", lat: 40.7839, lng: -73.9799 },
  { name: "86 St", lat: 40.7889, lng: -73.9767 },
  { name: "96 St", lat: 40.7939, lng: -73.9724 },
  { name: "103 St", lat: 40.7995, lng: -73.9682 },
  { name: "Cathedral Pkwy–110 St", lat: 40.804, lng: -73.9666 },
  { name: "116 St–Columbia University", lat: 40.8077, lng: -73.9641 },
] as const;

export const STATIONS = LINE_1.map((s) => s.name);
export const STOPS_TO_COLUMBIA = STATIONS.length - 1; // 23

/** Stations that always get a label on the map, so people can orient themselves. */
export const LANDMARK_STATIONS = new Set([0, 8, 13, 15, 20, STATIONS.length - 1]);
