export interface SubtitleTrack {
    url: string;
    lang: string;
    default?: boolean;
}

export interface StreamLink {
    quality: string;
    audio: string;
    provider?: string;
    server?: string;
    url: string;
    directUrl?: string;
    isHls: boolean;
    subtitles?: SubtitleTrack[];
}
