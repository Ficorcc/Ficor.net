import { communitySchemaVersion, siteInfo, links } from '../data/links';
import feed from '../config/feed.json';
import { communityData, importSiteSubscriptions } from './community';

export const communityLinksSnapshot = importSiteSubscriptions({ communitySchemaVersion, siteInfo, links }, feed);
export const communityFeedSnapshot = feed;
export const communitySnapshot = communityData(communityLinksSnapshot, communityFeedSnapshot);
